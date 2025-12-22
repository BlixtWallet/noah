use crate::{
    AppState,
    db::{
        backup_repo::BackupRepository, heartbeat_repo::HeartbeatRepository,
        offboarding_repo::OffboardingRepository, push_token_repo::PushTokenRepository,
    },
    notification_coordinator::{NotificationCoordinator, NotificationRequest},
    types::{BackupTriggerNotification, HeartbeatNotification, NotificationData},
};
use expo_push_notification_client::Priority;
use tokio_cron_scheduler::{Job, JobScheduler};

pub async fn send_backup_notifications(app_state: AppState) -> anyhow::Result<()> {
    let backup_repo = BackupRepository::new(&app_state.db_pool);

    let pubkeys = backup_repo.find_pubkeys_with_backup_enabled().await?;
    tracing::info!(
        job = "backup",
        user_count = pubkeys.len(),
        "starting backup notifications"
    );

    let coordinator = NotificationCoordinator::new(app_state.clone());

    for pubkey in pubkeys {
        let notification_data = NotificationData::BackupTrigger(BackupTriggerNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
        });

        let request = NotificationRequest {
            priority: Priority::Normal,
            data: notification_data,
            target_pubkey: Some(pubkey.clone()),
        };

        if let Err(e) = coordinator.send_notification(request).await {
            tracing::error!(job = "backup", pubkey = %pubkey, error = %e, "notification failed");
        }
    }

    Ok(())
}

pub async fn send_heartbeat_notifications(app_state: AppState) -> anyhow::Result<()> {
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    let active_users = heartbeat_repo.get_active_users().await?;
    tracing::info!(
        job = "heartbeat",
        user_count = active_users.len(),
        "starting heartbeat notifications"
    );

    let coordinator = NotificationCoordinator::new(app_state.clone());

    for pubkey in active_users {
        let notification_id = heartbeat_repo.create_notification(&pubkey).await?;

        let notification_data = NotificationData::Heartbeat(HeartbeatNotification {
            k1: String::new(), // Will be replaced with unique k1 per device
            notification_id: notification_id.clone(),
        });

        let request = NotificationRequest {
            priority: Priority::Normal,
            data: notification_data,
            target_pubkey: Some(pubkey.clone()),
        };

        if let Err(e) = coordinator.send_notification(request).await {
            tracing::error!(job = "heartbeat", pubkey = %pubkey, error = %e, "notification failed");
            // Rollback the created notification record
            if let Err(delete_err) = heartbeat_repo.delete_notification(&notification_id).await {
                tracing::error!(job = "heartbeat", notification_id = %notification_id, error = %delete_err, "failed to delete orphaned notification");
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

    tracing::info!(
        job = "deregister_inactive",
        user_count = users_to_deregister.len(),
        "starting"
    );

    for pubkey in users_to_deregister {
        tracing::debug!(job = "deregister_inactive", pubkey = %pubkey, "processing user");

        // Use a transaction to ensure all or nothing is deleted
        let mut tx = app_state.db_pool.begin().await?;

        if let Err(e) = PushTokenRepository::delete_by_pubkey(&mut tx, &pubkey).await {
            tracing::error!(job = "deregister_inactive", pubkey = %pubkey, step = "push_token", error = %e, "delete failed");
            continue;
        }

        if let Err(e) = OffboardingRepository::delete_by_pubkey(&mut tx, &pubkey).await {
            tracing::error!(job = "deregister_inactive", pubkey = %pubkey, step = "offboarding", error = %e, "delete failed");
            continue;
        }

        if let Err(e) = HeartbeatRepository::delete_by_pubkey_tx(&mut tx, &pubkey).await {
            tracing::error!(job = "deregister_inactive", pubkey = %pubkey, step = "heartbeat", error = %e, "delete failed");
            continue;
        }

        if let Err(e) = tx.commit().await {
            tracing::error!(job = "deregister_inactive", pubkey = %pubkey, step = "commit", error = %e, "transaction failed");
        } else {
            tracing::info!(job = "deregister_inactive", pubkey = %pubkey, "user deregistered");
        }
    }

    Ok(())
}

pub async fn cron_scheduler(
    app_state: AppState,
    backup_cron: String,
    heartbeat_cron: String,
    deregister_cron: String,
) -> anyhow::Result<JobScheduler> {
    let sched = JobScheduler::new().await?;

    tracing::info!(service = "cron", backup_schedule = %backup_cron, heartbeat_schedule = %heartbeat_cron, deregister_schedule = %deregister_cron, "scheduler initialized");

    let backup_app_state = app_state.clone();
    let backup_job = Job::new_async(&backup_cron, move |_, _| {
        let app_state = backup_app_state.clone();
        Box::pin(async move {
            if let Err(e) = send_backup_notifications(app_state).await {
                tracing::error!(job = "backup", error = %e, "job failed");
            }
        })
    })?;
    sched.add(backup_job).await?;

    // Heartbeat notifications
    let heartbeat_app_state = app_state.clone();
    let heartbeat_job = Job::new_async(&heartbeat_cron, move |_, _| {
        let app_state = heartbeat_app_state.clone();
        Box::pin(async move {
            if let Err(e) = send_heartbeat_notifications(app_state).await {
                tracing::error!(job = "heartbeat", error = %e, "job failed");
            }
        })
    })?;
    sched.add(heartbeat_job).await?;

    // Check for inactive users
    let inactive_check_app_state = app_state.clone();
    let inactive_check_job = Job::new_async(&deregister_cron, move |_, _| {
        let app_state = inactive_check_app_state.clone();
        Box::pin(async move {
            if let Err(e) = check_and_deregister_inactive_users(app_state).await {
                tracing::error!(job = "deregister_inactive", error = %e, "job failed");
            }
        })
    })?;
    sched.add(inactive_check_job).await?;

    Ok(sched)
}
