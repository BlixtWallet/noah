use anyhow::{Context, Result, anyhow};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use rsa::pkcs8::DecodePrivateKey;
use rsa::signature::SignatureEncoding;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const PLAY_INTEGRITY_API_BASE: &str = "https://playintegrity.googleapis.com/v1";
const PLAY_INTEGRITY_SCOPE: &str = "https://www.googleapis.com/auth/playintegrity";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceAccountCredentials {
    pub client_email: String,
    pub private_key: String,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AndroidAttestationResult {
    pub device_recognition_verdict: Vec<String>,
    pub environment: String,
}

pub struct AndroidAttestationParams<'a> {
    pub integrity_token: &'a str,
    pub package_name: &'a str,
    pub expected_nonce: Option<&'a str>,
    pub service_account_json: &'a str,
}

#[derive(Debug, Serialize)]
struct JwtClaims {
    iss: String,
    scope: String,
    aud: String,
    iat: u64,
    exp: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Serialize)]
struct DecodeIntegrityTokenRequest {
    #[serde(rename = "integrityToken")]
    integrity_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecodeIntegrityTokenResponse {
    token_payload_external: Option<TokenPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenPayload {
    request_details: Option<RequestDetails>,
    app_integrity: Option<AppIntegrity>,
    device_integrity: Option<DeviceIntegrity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestDetails {
    nonce: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppIntegrity {
    package_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceIntegrity {
    device_recognition_verdict: Option<Vec<String>>,
}

pub async fn verify_android_integrity(
    params: AndroidAttestationParams<'_>,
) -> Result<AndroidAttestationResult> {
    let credentials: ServiceAccountCredentials = serde_json::from_str(params.service_account_json)
        .context("Failed to parse service account JSON")?;

    let access_token = get_access_token(&credentials).await?;

    let response =
        decode_integrity_token(&access_token, params.package_name, params.integrity_token).await?;

    let payload = response
        .token_payload_external
        .ok_or_else(|| anyhow!("No token payload in response"))?;

    if let Some(expected_nonce) = params.expected_nonce
        && let Some(ref request_details) = payload.request_details
        && let Some(ref nonce) = request_details.nonce
        && nonce != expected_nonce
    {
        return Err(anyhow!(
            "Nonce mismatch: expected '{}', got '{}'",
            expected_nonce,
            nonce
        ));
    }

    if let Some(ref app_integrity) = payload.app_integrity
        && let Some(ref pkg_name) = app_integrity.package_name
        && pkg_name != params.package_name
    {
        return Err(anyhow!(
            "Package name mismatch: expected '{}', got '{}'",
            params.package_name,
            pkg_name
        ));
    }

    let device_verdict = payload
        .device_integrity
        .and_then(|d| d.device_recognition_verdict)
        .unwrap_or_default();

    let environment = determine_environment(&device_verdict);

    Ok(AndroidAttestationResult {
        device_recognition_verdict: device_verdict,
        environment,
    })
}

fn determine_environment(device_verdict: &[String]) -> String {
    if device_verdict.contains(&"MEETS_STRONG_INTEGRITY".to_string())
        || device_verdict.contains(&"MEETS_DEVICE_INTEGRITY".to_string())
    {
        "production".to_string()
    } else if device_verdict.contains(&"MEETS_BASIC_INTEGRITY".to_string()) {
        "basic".to_string()
    } else if device_verdict.contains(&"MEETS_VIRTUAL_INTEGRITY".to_string()) {
        "emulator".to_string()
    } else {
        "unknown".to_string()
    }
}

async fn get_access_token(credentials: &ServiceAccountCredentials) -> Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System time before UNIX epoch")?
        .as_secs();

    let claims = JwtClaims {
        iss: credentials.client_email.clone(),
        scope: PLAY_INTEGRITY_SCOPE.to_string(),
        aud: GOOGLE_TOKEN_URL.to_string(),
        iat: now,
        exp: now + 3600,
    };

    let jwt = create_signed_jwt(&claims, &credentials.private_key)?;

    let client = reqwest::Client::new();
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ])
        .send()
        .await
        .context("Failed to request access token")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to get access token: {} - {}", status, body));
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .context("Failed to parse token response")?;

    Ok(token_response.access_token)
}

fn create_signed_jwt(claims: &JwtClaims, private_key_pem: &str) -> Result<String> {
    let header = serde_json::json!({
        "alg": "RS256",
        "typ": "JWT"
    });

    let header_b64 = BASE64.encode(serde_json::to_string(&header)?);
    let claims_b64 = BASE64.encode(serde_json::to_string(claims)?);

    let signing_input = format!("{}.{}", header_b64, claims_b64);

    let key = rsa::RsaPrivateKey::from_pkcs8_pem(private_key_pem)
        .context("Failed to parse RSA private key")?;

    use rsa::pkcs1v15::SigningKey;
    use rsa::signature::Signer;
    use sha2::Sha256;

    let signing_key = SigningKey::<Sha256>::new(key);
    let signature = signing_key.sign(signing_input.as_bytes());
    let signature_b64 = BASE64.encode(signature.to_bytes());

    Ok(format!("{}.{}", signing_input, signature_b64))
}

async fn decode_integrity_token(
    access_token: &str,
    package_name: &str,
    integrity_token: &str,
) -> Result<DecodeIntegrityTokenResponse> {
    let full_url = format!(
        "{}/{}:decodeIntegrityToken",
        PLAY_INTEGRITY_API_BASE, package_name
    );

    let request_body = DecodeIntegrityTokenRequest {
        integrity_token: integrity_token.to_string(),
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&full_url)
        .bearer_auth(access_token)
        .json(&request_body)
        .send()
        .await
        .context("Failed to call Play Integrity API")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("Play Integrity API error: {} - {}", status, body));
    }

    let decoded: DecodeIntegrityTokenResponse = response
        .json()
        .await
        .context("Failed to parse Play Integrity response")?;

    Ok(decoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_environment() {
        assert_eq!(
            determine_environment(&["MEETS_STRONG_INTEGRITY".to_string()]),
            "production"
        );
        assert_eq!(
            determine_environment(&["MEETS_DEVICE_INTEGRITY".to_string()]),
            "production"
        );
        assert_eq!(
            determine_environment(&["MEETS_BASIC_INTEGRITY".to_string()]),
            "basic"
        );
        assert_eq!(
            determine_environment(&["MEETS_VIRTUAL_INTEGRITY".to_string()]),
            "emulator"
        );
        assert_eq!(determine_environment(&[]), "unknown");
    }

    #[test]
    fn test_parse_service_account_json() {
        let json = r#"{
            "client_email": "test@project.iam.gserviceaccount.com",
            "private_key": "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
            "project_id": "test-project"
        }"#;

        let creds: ServiceAccountCredentials = serde_json::from_str(json).unwrap();
        assert_eq!(creds.client_email, "test@project.iam.gserviceaccount.com");
        assert_eq!(creds.project_id, Some("test-project".to_string()));
    }
}
