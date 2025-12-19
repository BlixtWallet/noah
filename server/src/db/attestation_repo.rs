use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use sqlx::{PgPool, Postgres, Transaction};

#[derive(Debug, sqlx::FromRow)]
pub struct DeviceAttestation {
    pub id: i64,
    pub pubkey: String,
    pub platform: String,
    pub key_id: String,
    pub public_key: Option<String>, // Base64-encoded public key bytes
    pub receipt: Option<Vec<u8>>,
    pub environment: String,
    pub attestation_passed: bool,
    pub failure_reason: Option<String>,
}

pub struct AttestationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> AttestationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_pubkey_and_platform(
        &self,
        pubkey: &str,
        platform: &str,
    ) -> Result<Option<DeviceAttestation>> {
        let attestation = sqlx::query_as::<_, DeviceAttestation>(
            r#"
            SELECT id, pubkey, platform, key_id, public_key, receipt,
                   environment, attestation_passed, failure_reason
            FROM device_attestations
            WHERE pubkey = $1 AND platform = $2
            "#,
        )
        .bind(pubkey)
        .bind(platform)
        .fetch_optional(self.pool)
        .await?;

        Ok(attestation)
    }

    pub async fn upsert(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        platform: &str,
        key_id: &str,
        public_key_bytes: Option<&[u8]>,
        receipt: Option<&[u8]>,
        environment: &str,
        attestation_passed: bool,
        failure_reason: Option<&str>,
    ) -> Result<()> {
        let public_key_b64 = public_key_bytes.map(|bytes| BASE64.encode(bytes));

        sqlx::query(
            r#"
            INSERT INTO device_attestations
                (pubkey, platform, key_id, public_key, receipt, environment, attestation_passed, failure_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (pubkey, platform) DO UPDATE SET
                key_id = EXCLUDED.key_id,
                public_key = EXCLUDED.public_key,
                receipt = EXCLUDED.receipt,
                environment = EXCLUDED.environment,
                attestation_passed = EXCLUDED.attestation_passed,
                failure_reason = EXCLUDED.failure_reason,
                updated_at = now()
            "#,
        )
        .bind(pubkey)
        .bind(platform)
        .bind(key_id)
        .bind(public_key_b64)
        .bind(receipt)
        .bind(environment)
        .bind(attestation_passed)
        .bind(failure_reason)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    pub async fn has_valid_attestation(&self, pubkey: &str) -> Result<bool> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM device_attestations
                WHERE pubkey = $1 AND attestation_passed = true
            )
            "#,
        )
        .bind(pubkey)
        .fetch_one(self.pool)
        .await?;

        Ok(exists)
    }
}
