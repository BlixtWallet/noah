use crate::{AppState, push::send_push_notification};
use axum::extract::State;
use tokio_cron::{Job, Scheduler};

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
        title: Some("Maintenance".to_string()),
        body: Some("Running daily maintenance".to_string()),
        data: r#"{"type": "maintenance"}"#.to_string(),
        priority: "high".to_string(),
    };

    if let Err(e) = send_push_notification(State(app_state.clone()), data).await {
        tracing::error!("Failed to send push notification for maintenance: {}", e);
    }
}

pub fn cron_scheduler(app_state: AppState) -> anyhow::Result<Scheduler> {
    let mut sched = Scheduler::utc();

    let bg_sync_app_state = app_state.clone();
    sched.add(Job::new("0 0 * * * *", move || {
        let app_state = bg_sync_app_state.clone();
        background_sync(app_state)
    }));

    let maintenance_app_state = app_state.clone();
    sched.add(Job::new("0 0 0 * * *", move || {
        let app_state = maintenance_app_state.clone();
        maintenance(app_state)
    }));

    Ok(sched)
}
