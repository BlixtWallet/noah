use anyhow::Result;
use sqlx::{Postgres, Transaction};

use crate::types::DeviceInfo;

/// A struct to encapsulate device-related database operations.
/// It's currently an empty struct because its methods operate on transactions
/// passed in from other functions, rather than holding its own connection.
pub struct DeviceRepository;

impl DeviceRepository {
    /// Inserts a new device record, or updates an existing one if the pubkey already exists.
    /// This operation is performed within a given transaction to ensure atomicity.
    pub async fn upsert(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        device_info: &DeviceInfo,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO devices (pubkey, device_manufacturer, device_model, os_name, os_version, app_version)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT(pubkey) DO UPDATE SET
                 device_manufacturer = excluded.device_manufacturer,
                 device_model = excluded.device_model,
                 os_name = excluded.os_name,
                 os_version = excluded.os_version,
                 app_version = excluded.app_version,
                 updated_at = now()",
        )
        .bind(pubkey)
        .bind(device_info.device_manufacturer.clone())
        .bind(device_info.device_model.clone())
        .bind(device_info.os_name.clone())
        .bind(device_info.os_version.clone())
        .bind(device_info.app_version.clone())
        .execute(&mut *tx)
        .await?;
        Ok(())
    }
}
