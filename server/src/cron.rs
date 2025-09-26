use crate::{
    AppState,
    constants::{self, EnvVariables},
    db::{
        backup_repo::BackupRepository, heartbeat_repo::HeartbeatRepository,
        offboarding_repo::OffboardingRepository, push_token_repo::PushTokenRepository,
    },
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
            notification_id: None,
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
            notification_id: None,
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

pub async fn send_heartbeat_notifications(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    let active_users = heartbeat_repo.get_active_users().await?;
    tracing::info!(
        "Sending heartbeat notifications to {} active users",
        active_users.len()
    );

    for pubkey in active_users {
        let notification_id = heartbeat_repo.create_notification(&pubkey).await?;

        let notification_data = NotificationsData {
            notification_type: NotificationTypes::Heartbeat,
            k1: None,
            transaction_id: None,
            amount: None,
            offboarding_request_id: None,
            notification_id: Some(notification_id),
        };

        if let Err(e) = send_push_notification_with_unique_k1(
            app_state.clone(),
            notification_data,
            Some(pubkey.clone()),
        )
        .await
        {
            tracing::error!("Failed to send heartbeat notification to {}: {}", pubkey, e);
        }
    }

    // Cleanup old notifications
    heartbeat_repo.cleanup_old_notifications().await?;

    Ok(())
}

pub async fn check_and_deregister_inactive_users(app_state: AppState) -> anyhow::Result<()> {
    let conn = app_state.db.connect()?;
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    let users_to_deregister = heartbeat_repo.get_users_to_deregister().await?;

    if users_to_deregister.is_empty() {
        return Ok(());
    }

    tracing::info!("Deregistering {} inactive users", users_to_deregister.len());

    for pubkey in users_to_deregister {
        tracing::info!("Deregistering inactive user: {}", pubkey);

        // Use a transaction to ensure all or nothing is deleted
        let tx = conn.transaction().await?;

        if let Err(e) = PushTokenRepository::delete_by_pubkey(&tx, &pubkey).await {
            tracing::error!("Failed to delete push token for {}: {}", pubkey, e);
            continue;
        }

        if let Err(e) = OffboardingRepository::delete_by_pubkey(&tx, &pubkey).await {
            tracing::error!(
                "Failed to delete offboarding requests for {}: {}",
                pubkey,
                e
            );
            continue;
        }

        if let Err(e) = tx.commit().await {
            tracing::error!(
                "Failed to commit deregistration transaction for {}: {}",
                pubkey,
                e
            );
        } else {
            tracing::info!("Successfully deregistered inactive user: {}", pubkey);
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

    // Heartbeat notifications - every 48 hours
    let heartbeat_app_state = app_state.clone();
    let heartbeat_job = Job::new_async(constants::DEFAULT_HEARTBEAT_CRON, move |_, _| {
        let app_state = heartbeat_app_state.clone();
        Box::pin(async move {
            if let Err(e) = send_heartbeat_notifications(app_state).await {
                tracing::error!("Failed to send heartbeat notifications: {}", e);
            }
        })
    })?;
    sched.add(heartbeat_job).await?;

    // Check for inactive users - every 12 hours
    let inactive_check_app_state = app_state.clone();
    let inactive_check_job = Job::new_async(constants::DEFAULT_DEREGISTER_CRON, move |_, _| {
        let app_state = inactive_check_app_state.clone();
        Box::pin(async move {
            if let Err(e) = check_and_deregister_inactive_users(app_state).await {
                tracing::error!("Failed to check and deregister inactive users: {}", e);
            }
        })
    })?;
    sched.add(inactive_check_job).await?;

    Ok(sched)
}
