use aws_config::BehaviorVersion;
use aws_config::meta::region::RegionProviderChain;
use aws_sdk_s3::Client;
use aws_sdk_s3::presigning::PresigningConfig;
use std::time::Duration;

pub struct S3BackupClient {
    client: Client,
    bucket: String,
}

impl S3BackupClient {
    pub async fn new(bucket_name: String) -> Result<Self, anyhow::Error> {
        let region_provider = RegionProviderChain::default_provider().or_else("us-east-2");
        let config = aws_config::defaults(BehaviorVersion::latest())
            .region(region_provider)
            .load()
            .await;
        let client = Client::new(&config);
        Ok(Self {
            client,
            bucket: bucket_name,
        })
    }

    pub async fn generate_upload_url(&self, key: &str) -> Result<String, anyhow::Error> {
        let presigning_config = PresigningConfig::expires_in(Duration::from_secs(900))?; // 15 minutes
        let presigned_request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(presigning_config)
            .await?;
        Ok(presigned_request.uri().to_string())
    }

    pub async fn generate_download_url(&self, key: &str) -> Result<String, anyhow::Error> {
        let presigning_config = PresigningConfig::expires_in(Duration::from_secs(300))?; // 5 minutes
        let presigned_request = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(presigning_config)
            .await?;
        Ok(presigned_request.uri().to_string())
    }

    pub async fn delete_object(&self, key: &str) -> Result<(), anyhow::Error> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        Ok(())
    }
}
