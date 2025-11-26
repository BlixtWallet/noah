use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;

#[derive(Parser)]
#[command(name = "noah-cli")]
#[command(about = "CLI tool for Noah server administration", long_about = None)]
struct Cli {
    /// Path to config file
    #[arg(long, default_value = "/etc/server/config.toml")]
    config: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Send a push notification to all users
    Broadcast {
        /// Notification title
        #[arg(short, long)]
        title: String,

        /// Notification body
        #[arg(short, long)]
        body: String,

        /// Dry run - don't actually send, just show what would be sent
        #[arg(long, default_value = "false")]
        dry_run: bool,
    },

    /// Show statistics about registered users
    Stats,
}

#[derive(Debug, Clone, Deserialize)]
struct Config {
    postgres_url: String,
    expo_access_token: String,
}

impl Config {
    fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .context(format!("Failed to read config file: {}", path))?;
        let config: Config = toml::from_str(&content).context("Failed to parse config")?;
        Ok(config)
    }
}

fn is_expo_token(token: &str) -> bool {
    token.starts_with("ExponentPushToken[") && token.ends_with(']')
}

async fn cmd_broadcast(config: &Config, title: String, body: String, dry_run: bool) -> Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.postgres_url)
        .await
        .context("Failed to connect to database")?;

    let tokens: Vec<String> = sqlx::query_scalar("SELECT push_token FROM push_tokens")
        .fetch_all(&pool)
        .await
        .context("Failed to fetch push tokens")?;

    let expo_tokens: Vec<_> = tokens.into_iter().filter(|t| is_expo_token(t)).collect();

    if expo_tokens.is_empty() {
        println!("No Expo push tokens registered. Nothing to send.");
        return Ok(());
    }

    println!("Found {} Expo tokens", expo_tokens.len());
    println!();
    println!("Title: {}", title);
    println!("Body: {}", body);

    if dry_run {
        println!();
        println!("Dry run - no notifications sent.");
        return Ok(());
    }

    println!();
    print!("Send notifications? [y/N]: ");
    use std::io::{self, Write};
    io::stdout().flush()?;

    let mut input = String::new();
    io::stdin().read_line(&mut input)?;

    if !input.trim().eq_ignore_ascii_case("y") {
        println!("Aborted.");
        return Ok(());
    }

    println!();
    println!("Sending...");

    let expo = Expo::new(ExpoClientOptions {
        access_token: Some(config.expo_access_token.clone()),
    });

    let mut success_count = 0;
    let mut error_count = 0;

    let chunks: Vec<Vec<String>> = expo_tokens.chunks(100).map(|c| c.to_vec()).collect();

    for (i, chunk) in chunks.iter().enumerate() {
        let message = ExpoPushMessage::builder(chunk.clone())
            .title(&title)
            .body(&body)
            .sound("default")
            .build();

        match message {
            Ok(msg) => match expo.send_push_notifications(msg).await {
                Ok(_) => {
                    success_count += chunk.len();
                    println!(
                        "  Sent batch {}/{} ({} tokens)",
                        i + 1,
                        chunks.len(),
                        chunk.len()
                    );
                }
                Err(e) => {
                    error_count += chunk.len();
                    eprintln!("  Failed batch {}: {}", i + 1, e);
                }
            },
            Err(e) => {
                error_count += chunk.len();
                eprintln!("  Failed to build message for batch {}: {}", i + 1, e);
            }
        }
    }

    println!();
    println!("Done!");
    println!("  Successful: {}", success_count);
    println!("  Failed: {}", error_count);

    Ok(())
}

async fn cmd_stats(config: &Config) -> Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.postgres_url)
        .await
        .context("Failed to connect to database")?;

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let push_token_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM push_tokens")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    let tokens: Vec<String> = sqlx::query_scalar("SELECT push_token FROM push_tokens")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let expo_count = tokens.iter().filter(|t| is_expo_token(t)).count();

    println!("Noah Server Statistics");
    println!("======================");
    println!("Total users: {}", user_count);
    println!("Push tokens: {}", push_token_count);
    println!("  - Expo: {}", expo_count);

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    let config = Config::from_file(&cli.config)?;

    match cli.command {
        Commands::Broadcast {
            title,
            body,
            dry_run,
        } => {
            cmd_broadcast(&config, title, body, dry_run).await?;
        }
        Commands::Stats => {
            cmd_stats(&config).await?;
        }
    }

    Ok(())
}
