use crate::{AppState, cron::maintenance};

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

    tracing::info!("starting round subscription");
    while let Some(item) = stream.next().await {
        if let Ok(round_event) = item {
            if let Some(event) = round_event.event {
                match event {
                    round_event::Event::Start(_) => {
                        tracing::info!("Round started, triggering maintenance task");
                        let app_state_clone = app_state.clone();
                        tokio::spawn(async move {
                            maintenance(app_state_clone).await;
                        });
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
