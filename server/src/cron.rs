use crate::{AppState, push::send_push_notification};
use axum::extract::State;
use tokio_cron_scheduler::{Job, JobScheduler};

async fn background_sync(app_state: AppState) {
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: r#"{"type": "background-sync"}"#.to_string(),
        priority: "high".to_string(),
    };

    if let Err(e) = send_push_notification(State(app_state.clone()), data).await {
        tracing::error!(
            "Failed to send push notification for background sync: {}",
            e
        );
    }
}

async fn maintenance(app_state: AppState) {
    tracing::info!("Maintenance task running");
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: r#"{"type": "maintenance"}"#.to_string(),
        priority: "high".to_string(),
    };

    if let Err(e) = send_push_notification(State(app_state.clone()), data).await {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }
}

pub async fn cron_scheduler(app_state: AppState) -> anyhow::Result<JobScheduler> {
    let sched = JobScheduler::new().await?;

    let background_sync_cron =
        std::env::var("BACKGROUND_SYNC_CRON").unwrap_or_else(|_| "every 2 hours".to_string());
    let maintenance_cron =
        std::env::var("MAINTENANCE_CRON").unwrap_or_else(|_| "every 12 hours".to_string());

    let bg_sync_app_state = app_state.clone();
    let bg_job = Job::new_async(&background_sync_cron, move |_, _| {
        let app_state = bg_sync_app_state.clone();
        Box::pin(background_sync(app_state))
    })?;
    sched.add(bg_job).await?;

    let maintenance_app_state = app_state.clone();
    let maintenance_job = Job::new_async(&maintenance_cron, move |_, _| {
        let app_state = maintenance_app_state.clone();
        Box::pin(maintenance(app_state))
    })?;
    sched.add(maintenance_job).await?;

    Ok(sched)
}
