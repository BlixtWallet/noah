use crate::{
    AppState,
    constants::EnvVariables,
    db::offboarding_repo::OffboardingRepository,
    push::send_push_notification_with_unique_k1,
    types::{MaintenanceNotification, NotificationData, OffboardingNotification},
};

use bitcoin::hex::DisplayHex;
use futures_util::stream::StreamExt;
use server_rpc::{
    ArkServiceClient,
    protos::{Empty, HandshakeRequest, round_event},
};
use std::time::Duration;
use tokio::time::timeout;

pub async fn connect_to_ark_server(
    app_state: AppState,
    ark_server_url: String,
) -> anyhow::Result<()> {
    const INITIAL_RETRY_DELAY: Duration = Duration::from_secs(2);
    const MAX_RETRY_DELAY: Duration = Duration::from_secs(30);

    let mut retry_delay = INITIAL_RETRY_DELAY;

    loop {
        match establish_connection_and_process(&app_state, &ark_server_url).await {
            Ok(_) => {
                // Connection was successful but ended (stream closed)
                tracing::warn!("Ark server connection ended, attempting to reconnect...");
                retry_delay = INITIAL_RETRY_DELAY; // Reset delay on successful connection
            }
            Err(e) => {
                tracing::warn!("Failed to connect to Ark server: {}", e);
            }
        }

        tracing::info!(
            "Retrying connection ark server in {} seconds...",
            retry_delay.as_secs()
        );
        tokio::time::sleep(retry_delay).await;

        // Exponential backoff with max limit
        retry_delay = std::cmp::min(retry_delay * 2, MAX_RETRY_DELAY);
    }
}

async fn establish_connection_and_process(
    app_state: &AppState,
    ark_server_url: &str,
) -> anyhow::Result<()> {
    const TIMEOUT_DURATION: Duration = Duration::from_secs(5);

    // Connect with timeout
    let mut client = timeout(
        TIMEOUT_DURATION,
        ArkServiceClient::connect(ark_server_url.to_string()),
    )
    .await
    .map_err(|_| anyhow::anyhow!("Connection timed out after {}s", TIMEOUT_DURATION.as_secs()))?
    .map_err(|e| anyhow::anyhow!("Failed to connect: {}", e))?;

    tracing::info!("Successfully connected to Ark server");

    let response = client
        .handshake(HandshakeRequest { bark_version: None })
        .await?;

    tracing::info!("Handshake response: {:?}", response);

    let info = client.get_ark_info(Empty {}).await?.into_inner();

    tracing::info!(
        "Ark Server Public Key: {}, Ark Server Info: {:?}",
        info.server_pubkey.to_lower_hex_string(),
        info
    );

    let mut stream = client.subscribe_rounds(Empty {}).await?.into_inner();

    let maintenance_interval_rounds: u32 =
        std::env::var(EnvVariables::MaintenanceIntervalRounds.to_string())
            .unwrap_or_else(|_| "1".to_string())
            .parse()
            .unwrap_or(1);
    let mut round_counter = 0;

    tracing::info!("Starting round subscription");
    while let Some(item) = stream.next().await {
        match item {
            Ok(round_event) => {
                if let Some(event) = round_event.event {
                    match event {
                        round_event::Event::Start(event) => {
                            round_counter += 1;

                            // Handle offboarding requests for every round
                            let app_state_clone = app_state.clone();
                            tokio::spawn(async move {
                                let _ = handle_offboarding_requests(app_state_clone).await;
                            });

                            // Send maintenance notification every MAINTENANCE_INTERVAL_ROUNDS
                            if round_counter >= maintenance_interval_rounds {
                                tracing::info!(
                                    "Round started, triggering maintenance task for round_seq: {}, offboard_feerate: {}",
                                    event.round_seq,
                                    event.offboard_feerate_sat_vkb
                                );
                                let app_state_clone = app_state.clone();
                                tokio::spawn(async move {
                                    let _ = maintenance(app_state_clone).await;
                                });
                                round_counter = 0;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Stream error: {}", e));
            }
        }
    }

    // Stream ended
    Ok(())
}

pub async fn maintenance(app_state: AppState) -> anyhow::Result<()> {
    // Send maintenance notification with unique k1 for each device
    let notification_data = NotificationData::Maintenance(MaintenanceNotification {
        k1: String::new(), // Will be replaced with unique k1 per device
    });

    if let Err(e) = send_push_notification_with_unique_k1(app_state, notification_data, None).await
    {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }

    Ok(())
}

pub async fn handle_offboarding_requests(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;
    let offboarding_repo = OffboardingRepository::new(&conn);

    // Find all pending offboarding requests
    let pending_requests = offboarding_repo.find_all_pending().await?;

    for request in pending_requests {
        tracing::info!(
            "Processing offboarding request {} for pubkey: {}",
            request.request_id,
            request.pubkey
        );

        // Update status to processing
        offboarding_repo
            .update_status(&request.request_id, "processing")
            .await?;

        // Send push notification for offboarding
        let notification_data = NotificationData::Offboarding(OffboardingNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
            offboarding_request_id: request.request_id.clone(),
            address: request.address.clone(),
        });

        if let Err(e) = send_push_notification_with_unique_k1(
            app_state.clone(),
            notification_data,
            Some(request.pubkey),
        )
        .await
        {
            tracing::error!("Failed to send push notification for offboarding: {}", e);
            // Reset status to pending if failed
            offboarding_repo
                .update_status(&request.request_id, "pending")
                .await?;
        } else {
            // Mark as sent
            offboarding_repo
                .update_status(&request.request_id, "sent")
                .await?;
        }
    }
    Ok(())
}
