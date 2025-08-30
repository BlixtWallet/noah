use crate::{AppState, push::send_push_notification};

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
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: r#"{"type": "maintenance"}"#.to_string(),
        priority: "high".to_string(),
        content_available: true,
    };

    if let Err(e) = send_push_notification(app_state.clone(), data, None).await {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }
}
