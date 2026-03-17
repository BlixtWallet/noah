use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{
    Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode, errors::ErrorKind,
};
use serde::{Deserialize, Serialize};

use crate::{config::Config, errors::ApiError, types::AuthenticatedUser};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub sub: String,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, Clone)]
pub struct MintedAccessToken {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub expires_in_seconds: u64,
}

pub fn mint_access_token(config: &Config, pubkey: &str) -> anyhow::Result<MintedAccessToken> {
    let issued_at = Utc::now();
    let expires_at = issued_at + Duration::hours(config.auth_jwt_ttl_hours as i64);
    let expires_in_seconds = (expires_at - issued_at).num_seconds() as u64;

    let claims = AccessTokenClaims {
        sub: pubkey.to_string(),
        iat: issued_at.timestamp(),
        exp: expires_at.timestamp(),
    };

    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(config.auth_jwt_secret.as_bytes()),
    )?;

    Ok(MintedAccessToken {
        token,
        expires_at,
        expires_in_seconds,
    })
}

pub fn verify_access_token(config: &Config, token: &str) -> Result<AuthenticatedUser, ApiError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 30;
    validation.validate_exp = true;

    let token_data = decode::<AccessTokenClaims>(
        token,
        &DecodingKey::from_secret(config.auth_jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|error| match error.kind() {
        ErrorKind::ExpiredSignature => ApiError::TokenExpired,
        _ => ApiError::InvalidToken,
    })?;

    Ok(AuthenticatedUser {
        key: token_data.claims.sub,
    })
}
