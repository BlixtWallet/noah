use deadpool_redis::redis::AsyncCommands;

use super::redis_client::RedisClient;

const INVOICE_PREFIX: &str = "invoice:";
const INVOICE_TTL_SECONDS: u64 = 60;

#[derive(Clone)]
pub struct InvoiceStore {
    client: RedisClient,
}

impl InvoiceStore {
    pub fn new(client: RedisClient) -> Self {
        Self { client }
    }

    pub async fn store(&self, transaction_id: &str, invoice: &str) -> anyhow::Result<()> {
        let key = format!("{}{}", INVOICE_PREFIX, transaction_id);
        let mut conn = self.client.get_connection().await?;
        let _: () = conn.set_ex(&key, invoice, INVOICE_TTL_SECONDS).await?;
        Ok(())
    }

    pub async fn get(&self, transaction_id: &str) -> anyhow::Result<Option<String>> {
        let key = format!("{}{}", INVOICE_PREFIX, transaction_id);
        let mut conn = self.client.get_connection().await?;
        let invoice: Option<String> = conn.get(&key).await?;
        Ok(invoice)
    }

    pub async fn remove(&self, transaction_id: &str) -> anyhow::Result<()> {
        let key = format!("{}{}", INVOICE_PREFIX, transaction_id);
        let mut conn = self.client.get_connection().await?;
        let _: () = conn.del(&key).await?;
        Ok(())
    }
}
