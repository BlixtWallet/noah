use anyhow::Context;
use deadpool_redis::{Connection, Pool, Runtime, redis::cmd};

/// Simple wrapper around a Redis connection pool.
#[derive(Clone)]
pub struct RedisClient {
    pool: Pool,
}

impl RedisClient {
    /// Build a new Redis pool for the provided URL.
    pub fn new(connection_url: &str) -> anyhow::Result<Self> {
        let config = deadpool_redis::Config::from_url(connection_url);
        let pool = config
            .create_pool(Some(Runtime::Tokio1))
            .context("Failed to create Redis pool")?;

        Ok(Self { pool })
    }

    /// Grab a pooled connection.
    pub async fn get_connection(&self) -> anyhow::Result<Connection> {
        self.pool
            .get()
            .await
            .context("Failed to acquire Redis connection")
    }

    /// Check connectivity by issuing a PING.
    pub async fn check_connection(&self) -> anyhow::Result<()> {
        let mut connection = self.get_connection().await?;
        let _: String = cmd("PING")
            .query_async(&mut connection)
            .await
            .context("Failed to connect to Redis")?;
        Ok(())
    }
}
