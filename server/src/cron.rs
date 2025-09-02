use crate::{
    AppState,
    push::send_push_notification,
    types::{NotificationTypes, NotificationsData},
    utils::make_k1,
};
use serde::{Deserialize, Serialize};
use tokio_cron_scheduler::{Job, JobScheduler};

async fn background_sync(app_state: AppState) {
    let data = crate::push::PushNotificationData {
        title: None,
        body: None,
        data: serde_json::to_string(&NotificationsData {
            notification_type: NotificationTypes::BackgroundSync,
            k1: None,
            amount: None,
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

#[derive(Serialize, Deserialize, Debug)]
struct BackupNotificationData {
    notification_type: String,
    k1: Option<String>,
}

pub async fn send_backup_notifications(app_state: AppState) -> anyhow::Result<()> {
    let k1 = make_k1(app_state.k1_values.clone());

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
            data: serde_json::to_string(&NotificationsData {
                notification_type: NotificationTypes::BackupTrigger,
                k1: Some(k1.clone()),
                amount: None,
            })?,
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
    let bg_sync_app_state = app_state.clone();
    let bg_job = Job::new_async(&background_sync_cron, move |_, _| {
        let app_state = bg_sync_app_state.clone();
        Box::pin(background_sync(app_state))
    })?;
    sched.add(bg_job).await?;

    let backup_cron = std::env::var("BACKUP_CRON").unwrap_or_else(|_| "every 2 hours".to_string());
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
