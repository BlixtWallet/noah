use crate::{
    AppState, constants,
    db::{
        backup_repo::BackupRepository, heartbeat_repo::HeartbeatRepository,
        offboarding_repo::OffboardingRepository, push_token_repo::PushTokenRepository,
    },
    notification_coordinator::{
        NotificationCoordinator, NotificationPriority, NotificationRequest,
    },
    types::{BackupTriggerNotification, HeartbeatNotification, NotificationData},
};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::info;

pub async fn send_backup_notifications(app_state: AppState) -> anyhow::Result<()> {
    let backup_repo = BackupRepository::new(&app_state.db_pool);

    let pubkeys = backup_repo.find_pubkeys_with_backup_enabled().await?;
    info!("Pubkeys registered for backup {:?}", pubkeys);

    let coordinator = NotificationCoordinator::new(app_state.clone());

    for pubkey in pubkeys {
        let notification_data = NotificationData::BackupTrigger(BackupTriggerNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
        });

        let request = NotificationRequest {
            priority: NotificationPriority::Normal,
            data: notification_data,
            target_pubkey: Some(pubkey),
        };

        if let Err(e) = coordinator.send_notification(request).await {
            tracing::error!("Failed to send backup notification: {}", e);
        }
    }

    Ok(())
}

pub async fn send_heartbeat_notifications(app_state: AppState) -> anyhow::Result<()> {
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    let active_users = heartbeat_repo.get_active_users().await?;
    tracing::info!(
        "Sending heartbeat notifications to {} active users",
        active_users.len()
    );

    let coordinator = NotificationCoordinator::new(app_state.clone());

    for pubkey in active_users {
        let notification_id = heartbeat_repo.create_notification(&pubkey).await?;

        let notification_data = NotificationData::Heartbeat(HeartbeatNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
            notification_id: notification_id.clone(),
        });

        let request = NotificationRequest {
            priority: NotificationPriority::Normal,
            data: notification_data,
            target_pubkey: Some(pubkey.clone()),
        };

        if let Err(e) = coordinator.send_notification(request).await {
            tracing::error!("Failed to send heartbeat notification to {}: {}", pubkey, e);
            // Rollback the created notification record
            if let Err(delete_err) = heartbeat_repo.delete_notification(&notification_id).await {
                tracing::error!(
                    "Failed to delete orphaned heartbeat notification {}: {}",
                    notification_id,
                    delete_err
                );
            }
        }
    }

    // Cleanup old notifications
    heartbeat_repo.cleanup_old_notifications().await?;

    Ok(())
}

pub async fn check_and_deregister_inactive_users(app_state: AppState) -> anyhow::Result<()> {
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    let users_to_deregister = heartbeat_repo.get_users_to_deregister().await?;

    if users_to_deregister.is_empty() {
        return Ok(());
    }

    tracing::info!("Deregistering {} inactive users", users_to_deregister.len());

    for pubkey in users_to_deregister {
        tracing::info!("Deregistering inactive user: {}", pubkey);

        // Use a transaction to ensure all or nothing is deleted
        let mut tx = app_state.db_pool.begin().await?;

        if let Err(e) = PushTokenRepository::delete_by_pubkey(&mut tx, &pubkey).await {
            tracing::error!("Failed to delete push token for {}: {}", pubkey, e);
            continue;
        }

        if let Err(e) = OffboardingRepository::delete_by_pubkey(&mut tx, &pubkey).await {
            tracing::error!(
                "Failed to delete offboarding requests for {}: {}",
                pubkey,
                e
            );
            continue;
        }

        if let Err(e) = HeartbeatRepository::delete_by_pubkey_tx(&mut tx, &pubkey).await {
            tracing::error!(
                "Failed to delete heartbeat notifications for {}: {}",
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

pub async fn cron_scheduler(
    app_state: AppState,
    backup_cron: String,
) -> anyhow::Result<JobScheduler> {
    let sched = JobScheduler::new().await?;

    info!("Backup cron: {}", backup_cron);

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
