use crate::{
    AppState,
    db::offboarding_repo::OffboardingRepository,
    notification_coordinator::{NotificationCoordinator, NotificationRequest},
    types::{
        MaintenanceNotification, NotificationData, OffboardingNotification, OffboardingStatus,
    },
};

use bitcoin::hex::DisplayHex;
use expo_push_notification_client::Priority;
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
                tracing::warn!(
                    service = "ark_client",
                    event = "connection_ended",
                    "reconnecting"
                );
                retry_delay = INITIAL_RETRY_DELAY;
            }
            Err(e) => {
                tracing::warn!(service = "ark_client", event = "connection_failed", error = %e, "failed to connect");
            }
        }

        tracing::info!(
            service = "ark_client",
            event = "retry_scheduled",
            delay_secs = retry_delay.as_secs(),
            "retrying"
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

    tracing::info!(
        service = "ark_client",
        event = "connected",
        "connected to ark server"
    );

    let response = client
        .handshake(HandshakeRequest { bark_version: None })
        .await?;

    tracing::debug!(service = "ark_client", event = "handshake", response = ?response, "handshake complete");

    let info = client.get_ark_info(Empty {}).await?.into_inner();

    tracing::info!(
        service = "ark_client",
        event = "ark_info",
        server_pubkey = %info.server_pubkey.to_lower_hex_string(),
        "received ark server info"
    );

    let mut stream = client.subscribe_rounds(Empty {}).await?.into_inner();

    let maintenance_interval_rounds = app_state.config.maintenance_interval_rounds;
    let mut round_counter = 0;

    tracing::info!(
        service = "ark_client",
        event = "subscribed",
        "listening for rounds"
    );
    while let Some(item) = stream.next().await {
        match item {
            Ok(round_event) => {
                if let Some(round_event::Event::Attempt(event)) = round_event.event {
                    round_counter += 1;

                    // Handle offboarding requests for every round
                    let app_state_clone = app_state.clone();
                    tokio::spawn(async move {
                        let _ = handle_offboarding_requests(app_state_clone).await;
                    });

                    // Send maintenance notification every MAINTENANCE_INTERVAL_ROUNDS
                    if round_counter >= maintenance_interval_rounds {
                        tracing::info!(
                            service = "ark_client",
                            event = "maintenance_triggered",
                            round_seq = event.round_seq,
                            round_attempt_challenge = %event.round_attempt_challenge.to_lower_hex_string(),
                            "triggering maintenance"
                        );
                        let app_state_clone = app_state.clone();
                        tokio::spawn(async move {
                            let _ = maintenance(app_state_clone).await;
                        });
                        round_counter = 0;
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
    let coordinator = NotificationCoordinator::new(app_state);

    let notification_data = NotificationData::Maintenance(MaintenanceNotification {
        k1: String::new(), // Will be replaced with unique k1 per device
    });

    let request = NotificationRequest {
        priority: Priority::High,
        data: notification_data,
        target_pubkey: None, // Broadcast to all users
    };

    if let Err(e) = coordinator.send_notification(request).await {
        tracing::error!(service = "ark_client", job = "maintenance", error = %e, "notification failed");
    }

    Ok(())
}

pub async fn handle_offboarding_requests(app_state: AppState) -> anyhow::Result<()> {
    let offboarding_repo = OffboardingRepository::new(&app_state.db_pool);

    // Find all pending offboarding requests
    let pending_requests = offboarding_repo.find_all_pending().await?;

    // Create coordinator once for all offboarding requests
    let coordinator = NotificationCoordinator::new(app_state.clone());

    for request in pending_requests {
        tracing::info!(
            service = "ark_client",
            job = "offboarding",
            request_id = %request.request_id,
            pubkey = %request.pubkey,
            "processing request"
        );

        // Update status to processing
        offboarding_repo
            .update_status(&request.request_id, OffboardingStatus::Processing)
            .await?;

        // Send push notification for offboarding
        let notification_data = NotificationData::Offboarding(OffboardingNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
            offboarding_request_id: request.request_id.clone(),
            address: request.address.clone(),
            address_signature: request.address_signature.clone(),
        });

        let notification_request = NotificationRequest {
            priority: Priority::High,
            data: notification_data,
            target_pubkey: Some(request.pubkey.clone()),
        };

        if let Err(e) = coordinator.send_notification(notification_request).await {
            tracing::error!(service = "ark_client", job = "offboarding", request_id = %request.request_id, error = %e, "notification failed");
            // Reset status to pending if failed
            offboarding_repo
                .update_status(&request.request_id, OffboardingStatus::Pending)
                .await?;
        } else {
            // Mark as sent
            offboarding_repo
                .update_status(&request.request_id, OffboardingStatus::Sent)
                .await?;
        }
    }
    Ok(())
}
