use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use sqlx::{PgPool, Postgres, Transaction};

#[derive(Debug, sqlx::FromRow)]
pub struct DeviceAttestation {
    pub id: i64,
    pub pubkey: String,
    pub platform: String,
    pub key_id: String,
    pub public_key: Option<String>,
    pub receipt: Option<Vec<u8>>,
    pub environment: String,
    pub attestation_passed: bool,
    pub failure_reason: Option<String>,
}

pub struct UpsertAttestationData<'a> {
    pub pubkey: &'a str,
    pub platform: &'a str,
    pub key_id: &'a str,
    pub public_key_bytes: Option<&'a [u8]>,
    pub receipt: Option<&'a [u8]>,
    pub environment: &'a str,
    pub attestation_passed: bool,
    pub failure_reason: Option<&'a str>,
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
        data: &UpsertAttestationData<'_>,
    ) -> Result<()> {
        let public_key_b64 = data.public_key_bytes.map(|bytes| BASE64.encode(bytes));

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
        .bind(data.pubkey)
        .bind(data.platform)
        .bind(data.key_id)
        .bind(public_key_b64)
        .bind(data.receipt)
        .bind(data.environment)
        .bind(data.attestation_passed)
        .bind(data.failure_reason)
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
