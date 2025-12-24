use aws_config::BehaviorVersion;
use aws_config::meta::region::RegionProviderChain;
use aws_sdk_sesv2::Client;
use aws_sdk_sesv2::types::{Body, Content, Destination, EmailContent, Message};

#[derive(Clone)]
pub struct EmailClient {
    client: Client,
    from_address: String,
    dev_mode: bool,
}

impl EmailClient {
    pub async fn new(from_address: String, dev_mode: bool) -> Result<Self, anyhow::Error> {
        if dev_mode {
            tracing::info!("Email client running in DEV MODE - emails will be logged, not sent");
        }

        let region_provider = RegionProviderChain::default_provider().or_else("us-east-2");
        let config = aws_config::defaults(BehaviorVersion::latest())
            .region(region_provider)
            .load()
            .await;
        let client = Client::new(&config);
        Ok(Self {
            client,
            from_address,
            dev_mode,
        })
    }

    pub async fn send_verification_email(
        &self,
        to_address: &str,
        verification_code: &str,
    ) -> anyhow::Result<()> {
        if self.dev_mode {
            tracing::warn!("========================================");
            tracing::warn!("DEV MODE: Email verification code for {}", to_address);
            tracing::warn!("CODE: {}", verification_code);
            tracing::warn!("========================================");
            return Ok(());
        }

        tracing::debug!(
            "Attempting to send verification email to {} from {}",
            to_address,
            self.from_address
        );
        let subject = Content::builder()
            .data("Verify your Noah Wallet email")
            .charset("UTF-8")
            .build()?;

        let body_text = format!(
            "Your Noah Wallet verification code is: {}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.",
            verification_code
        );

        let body_html = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Verify your Noah wallet email</h2>
        <p>Your verification code is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
            {}
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you did not request this code, please ignore this email.</p>
    </div>
</body>
</html>"#,
            verification_code
        );

        let text_content = Content::builder()
            .data(body_text)
            .charset("UTF-8")
            .build()?;

        let html_content = Content::builder()
            .data(body_html)
            .charset("UTF-8")
            .build()?;

        let body = Body::builder()
            .text(text_content)
            .html(html_content)
            .build();

        let message = Message::builder().subject(subject).body(body).build();

        let email_content = EmailContent::builder().simple(message).build();

        let destination = Destination::builder().to_addresses(to_address).build();

        match self
            .client
            .send_email()
            .from_email_address(&self.from_address)
            .destination(destination)
            .content(email_content)
            .send()
            .await
        {
            Ok(_) => {
                tracing::debug!("Verification email sent to {}", to_address);
                Ok(())
            }
            Err(e) => {
                tracing::error!("AWS SES error sending to {}: {:?}", to_address, e);
                tracing::error!("SES error details: {}", e);
                Err(anyhow::anyhow!("Failed to send email via SES: {}", e))
            }
        }
    }
}
