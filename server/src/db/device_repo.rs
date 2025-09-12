use anyhow::Result;

use crate::types::DeviceInfo;

/// A struct to encapsulate device-related database operations.
/// It's currently an empty struct because its methods operate on transactions
/// passed in from other functions, rather than holding its own connection.
pub struct DeviceRepository;

impl DeviceRepository {
    /// Inserts a new device record, or updates an existing one if the pubkey already exists.
    /// This operation is performed within a given transaction to ensure atomicity.
    pub async fn upsert(
        tx: &libsql::Transaction,
        pubkey: &str,
        device_info: &DeviceInfo,
    ) -> Result<()> {
        tx.execute(
            "INSERT INTO devices (pubkey, device_manufacturer, device_model, os_name, os_version, app_version)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(pubkey) DO UPDATE SET
                 device_manufacturer = excluded.device_manufacturer,
                 device_model = excluded.device_model,
                 os_name = excluded.os_name,
                 os_version = excluded.os_version,
                 app_version = excluded.app_version,
                 updated_at = CURRENT_TIMESTAMP",
            libsql::params![
                pubkey,
                device_info.device_manufacturer.clone(),
                device_info.device_model.clone(),
                device_info.os_name.clone(),
                device_info.os_version.clone(),
                device_info.app_version.clone()
            ],
        )
        .await?;
        Ok(())
    }
}
