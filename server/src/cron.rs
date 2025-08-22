use crate::{AppState, push::send_push_notification};
use tokio_cron_scheduler::{Job, JobScheduler};

async fn background_sync(app_state: AppState) {
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: r#"{"type": "background-sync"}"#.to_string(),
        priority: "high".to_string(),
        content_available: true,
    };

    if let Err(e) = send_push_notification(app_state.clone(), data, None).await {
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
        content_available: true,
    };

    if let Err(e) = send_push_notification(app_state.clone(), data, None).await {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }
}

pub async fn send_backup_notifications(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;
    let mut rows = conn
        .query(
            "SELECT pubkey FROM backup_settings WHERE backup_enabled = TRUE",
            (),
        )
        .await?;

    while let Some(row) = rows.next().await? {
        let pubkey: String = row.get(0)?;
        let data = crate::push::PushNotificationData {
            title: None,
            body: None,
            data: r#"{"type": "backup_trigger"}"#.to_string(),
            priority: "high".to_string(),
            content_available: true,
        };
        if let Err(e) = send_push_notification(app_state.clone(), data, Some(pubkey)).await {
            tracing::error!("Failed to send backup notification: {}", e);
        }
    }

    Ok(())
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

    let backup_cron = std::env::var("BACKUP_CRON").unwrap_or_else(|_| "0 0 * * *".to_string());
    let backup_app_state = app_state.clone();
    let backup_job = Job::new_async(&backup_cron, move |_, _| {
        let app_state = backup_app_state.clone();
        Box::pin(send_backup_notifications(app_state))
    })?;
    sched.add(backup_job).await?;

    Ok(sched)
}
