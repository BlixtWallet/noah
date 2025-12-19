use anyhow::{Context, Result, anyhow};
use appattest_rs::attestation::Attestation;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

#[derive(Debug, Clone)]
pub struct IosAttestationResult {
    pub public_key_bytes: Vec<u8>,
    pub receipt: Vec<u8>,
    pub environment: String,
}

pub struct IosAttestationParams<'a> {
    pub attestation_base64: &'a str,
    pub challenge: &'a str,
    pub key_id: &'a str,
    pub bundle_identifier: &'a str,
    pub team_identifier: &'a str,
    pub allow_development: bool,
}

pub fn verify_ios_attestation(params: IosAttestationParams) -> Result<IosAttestationResult> {
    let app_id = format!("{}.{}", params.team_identifier, params.bundle_identifier);

    let attestation = Attestation::from_base64(params.attestation_base64)
        .map_err(|e| anyhow!("Failed to parse attestation: {}", e))?;

    let environment = detect_environment(params.attestation_base64)?;

    if environment == "development" && !params.allow_development {
        return Err(anyhow!("Development environment attestation not allowed"));
    }

    let (public_key_bytes, receipt) = attestation
        .verify(params.challenge, &app_id, params.key_id)
        .map_err(|e| anyhow!("Attestation verification failed: {}", e))?;

    Ok(IosAttestationResult {
        public_key_bytes,
        receipt,
        environment,
    })
}

fn detect_environment(attestation_base64: &str) -> Result<String> {
    let attestation_bytes = BASE64
        .decode(attestation_base64)
        .context("Failed to decode attestation from base64")?;

    let decoded: ciborium::Value = ciborium::from_reader(&attestation_bytes[..])
        .context("Failed to decode CBOR attestation")?;

    let map = decoded
        .as_map()
        .ok_or_else(|| anyhow!("Attestation is not a CBOR map"))?;

    let auth_data = map
        .iter()
        .find(|(k, _)| k.as_text() == Some("authData"))
        .and_then(|(_, v)| v.as_bytes())
        .ok_or_else(|| anyhow!("authData not found or not bytes"))?;

    if auth_data.len() < 53 {
        return Err(anyhow!("authData too short for aaguid"));
    }

    let aaguid = &auth_data[37..53];

    const AAGUID_DEVELOPMENT: &[u8] = b"appattestdevelop";
    const AAGUID_PRODUCTION: &[u8] = &[
        b'a', b'p', b'p', b'a', b't', b't', b'e', b's', b't', 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00,
    ];

    if aaguid == AAGUID_PRODUCTION {
        Ok("production".to_string())
    } else if aaguid == AAGUID_DEVELOPMENT {
        Ok("development".to_string())
    } else {
        Err(anyhow!("Invalid aaguid in attestation"))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_aaguid_constants() {
        const AAGUID_DEVELOPMENT: &[u8] = b"appattestdevelop";
        const AAGUID_PRODUCTION: &[u8] = &[
            b'a', b'p', b'p', b'a', b't', b't', b'e', b's', b't', 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00,
        ];

        assert_eq!(AAGUID_DEVELOPMENT.len(), 16);
        assert_eq!(AAGUID_PRODUCTION.len(), 16);
    }
}
