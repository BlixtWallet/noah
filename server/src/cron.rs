use crate::{
    AppState,
    constants::{self, EnvVariables},
    db::backup_repo::BackupRepository,
    push::{send_push_notification, send_push_notification_with_unique_k1},
    types::{NotificationTypes, NotificationsData},
};
use tokio_cron_scheduler::{Job, JobScheduler};

async fn background_sync(app_state: AppState) {
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: serde_json::to_string(&NotificationsData {
            notification_type: NotificationTypes::BackgroundSync,
            k1: None,
            transaction_id: None,
            amount: None,
            offboarding_request_id: None,
        })
        .unwrap(),
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

pub async fn send_backup_notifications(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;
    let backup_repo = BackupRepository::new(&conn);

    let pubkeys = backup_repo.find_pubkeys_with_backup_enabled().await?;

    for pubkey in pubkeys {
        let notification_data = NotificationsData {
            notification_type: NotificationTypes::BackupTrigger,
            k1: None, // Will be generated uniquely for each device by the send function
            transaction_id: None,
            amount: None,
            offboarding_request_id: None,
        };
        if let Err(e) = send_push_notification_with_unique_k1(
            app_state.clone(),
            notification_data,
            Some(pubkey),
        )
        .await
        {
            tracing::error!("Failed to send backup notification: {}", e);
        }
    }

    Ok(())
}

pub async fn cron_scheduler(app_state: AppState) -> anyhow::Result<JobScheduler> {
    let sched = JobScheduler::new().await?;

    let background_sync_cron = std::env::var(EnvVariables::BackgroundSyncCron.to_string())
        .unwrap_or(constants::DEFAULT_BACKGROUND_SYNC_CRON.to_string());

    let bg_sync_app_state = app_state.clone();
    let bg_job = Job::new_async(&background_sync_cron, move |_, _| {
        let app_state = bg_sync_app_state.clone();
        Box::pin(background_sync(app_state))
    })?;
    sched.add(bg_job).await?;

    let backup_cron = std::env::var(EnvVariables::BackupCron.to_string())
        .unwrap_or(constants::DEFAULT_BACKUP_CRON.to_string());

    let backup_app_state = app_state.clone();
    let backup_job = Job::new_async(&backup_cron, move |_, _| {
        let app_state = backup_app_state.clone();
        Box::pin(async move {
            if let Err(e) = send_backup_notifications(app_state).await {
                tracing::error!("Failed to send backup notifications: {}", e);
            }
        })
    })?;
    sched.add(backup_job).await?;

    Ok(sched)
}
