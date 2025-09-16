use crate::{
    AppState,
    constants::EnvVariables,
    db::offboarding_repo::OffboardingRepository,
    push::send_push_notification_with_unique_k1,
    types::{NotificationTypes, NotificationsData},
};

use bitcoin::hex::DisplayHex;
use futures_util::stream::StreamExt;
use server_rpc::{
    ArkServiceClient,
    protos::{Empty, HandshakeRequest, round_event},
};

pub async fn connect_to_ark_server(
    app_state: AppState,
    ark_server_url: String,
) -> anyhow::Result<()> {
    let mut client = ArkServiceClient::connect(ark_server_url).await?;

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

    tracing::info!("starting round subscription");
    while let Some(item) = stream.next().await {
        if let Ok(round_event) = item {
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
    }

    Ok(())
}

pub async fn maintenance(app_state: AppState) -> anyhow::Result<()> {
    // Send maintenance notification with unique k1 for each device
    let notification_data = NotificationsData {
        notification_type: NotificationTypes::Maintenance,
        k1: None, // Will be generated uniquely for each device
        transaction_id: None,
        amount: None,
        offboarding_request_id: None,
    };

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
        let notification_data = NotificationsData {
            notification_type: NotificationTypes::Offboarding,
            k1: None, // Will be generated uniquely for each device
            transaction_id: None,
            amount: None,
            offboarding_request_id: Some(request.request_id.clone()),
        };

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
