use anyhow::Context;
use deadpool_redis::redis::AsyncCommands;

use super::redis_client::RedisClient;

const LAST_ROUND_TS_KEY: &str = "maintenance:last_round_timestamp";
const ROUND_COUNTER_KEY: &str = "maintenance:round_counter";

#[derive(Clone)]
pub struct MaintenanceStore {
    client: RedisClient,
}

impl MaintenanceStore {
    pub fn new(client: RedisClient) -> Self {
        Self { client }
    }

    pub async fn get_last_round_timestamp(&self) -> anyhow::Result<Option<u64>> {
        let mut conn = self.client.get_connection().await?;
        let ts: Option<u64> = conn
            .get(LAST_ROUND_TS_KEY)
            .await
            .context("Failed to get last round timestamp")?;
        Ok(ts)
    }

    pub async fn set_last_round_timestamp(&self, ts: u64) -> anyhow::Result<()> {
        let mut conn = self.client.get_connection().await?;
        let _: () = conn
            .set(LAST_ROUND_TS_KEY, ts)
            .await
            .context("Failed to set last round timestamp")?;
        Ok(())
    }

    pub async fn get_round_counter(&self) -> anyhow::Result<u16> {
        let mut conn = self.client.get_connection().await?;
        let counter: Option<u16> = conn
            .get(ROUND_COUNTER_KEY)
            .await
            .context("Failed to get round counter")?;
        Ok(counter.unwrap_or(0))
    }

    pub async fn increment_round_counter(&self) -> anyhow::Result<u16> {
        let mut conn = self.client.get_connection().await?;
        let counter: u16 = conn
            .incr(ROUND_COUNTER_KEY, 1u16)
            .await
            .context("Failed to increment round counter")?;
        Ok(counter)
    }

    pub async fn reset_round_counter(&self) -> anyhow::Result<()> {
        let mut conn = self.client.get_connection().await?;
        let _: () = conn
            .set(ROUND_COUNTER_KEY, 0u16)
            .await
            .context("Failed to reset round counter")?;
        Ok(())
    }
}
