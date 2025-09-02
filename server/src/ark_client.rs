use crate::{
    AppState,
    push::send_push_notification,
    types::{NotificationTypes, NotificationsData},
    utils::make_k1,
};

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

    let info = client.get_ark_info(Empty {}).await?;

    tracing::info!("Ark info: {:?}", info);

    let mut stream = client.subscribe_rounds(Empty {}).await?.into_inner();

    let maintenance_interval_rounds: u32 = std::env::var("MAINTENANCE_INTERVAL_ROUNDS")
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
                                maintenance(app_state_clone).await;
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

pub async fn maintenance(app_state: AppState) {
    // Send maintenance notification
    let k1 = make_k1(app_state.k1_values.clone());
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: serde_json::to_string(&NotificationsData {
            notification_type: NotificationTypes::Maintenance,
            k1: Some(k1),
            amount: None,
            offboarding_request_id: None,
        })
        .unwrap(),
        priority: "high".to_string(),
        content_available: true,
    };

    if let Err(e) = send_push_notification(app_state, data, None).await {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }
}

pub async fn handle_offboarding_requests(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;

    // Handle offboarding requests
    let mut rows = conn
        .query(
            "SELECT request_id, pubkey FROM offboarding_requests WHERE status = 'pending'",
            (),
        )
        .await?;

    while let Some(row) = rows.next().await? {
        let request_id: String = row.get(0)?;
        let pubkey: String = row.get(1)?;

        tracing::info!(
            "Processing offboarding request {} for pubkey: {}",
            request_id,
            pubkey
        );
        // Update status to processing
        conn.execute(
            "UPDATE offboarding_requests SET status = 'processing' WHERE request_id = ?",
            libsql::params![request_id.clone()],
        )
        .await
        .unwrap();

        // Send push notification for offboarding
        let k1 = make_k1(app_state.k1_values.clone());
        let offboard_data = crate::push::PushNotificationData {
            title: None,
            body: None,
            data: serde_json::to_string(&NotificationsData {
                notification_type: NotificationTypes::Offboarding,
                k1: Some(k1),
                amount: None,
                offboarding_request_id: Some(request_id.clone()),
            })
            .unwrap(),
            priority: "high".to_string(),
            content_available: true,
        };

        if let Err(e) = send_push_notification(app_state.clone(), offboard_data, Some(pubkey)).await
        {
            tracing::error!("Failed to send push notification for offboarding: {}", e);
            // Reset status to pending if failed
            conn.execute(
                "UPDATE offboarding_requests SET status = 'pending' WHERE request_id = ?",
                libsql::params![request_id],
            )
            .await
            .unwrap();
        } else {
            // Mark as sent
            conn.execute(
                "UPDATE offboarding_requests SET status = 'sent' WHERE request_id = ?",
                libsql::params![request_id],
            )
            .await
            .unwrap();
        }
    }
    Ok(())
}
