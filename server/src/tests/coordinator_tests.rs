use crate::db::notification_tracking_repo::NotificationTrackingRepository;
use crate::db::user_repo::UserRepository;
use crate::notification_coordinator::{NotificationCoordinator, NotificationRequest};
use crate::tests::common::{TestUser, setup_test_app};
use crate::types::{BackupTriggerNotification, MaintenanceNotification, NotificationData};
use chrono::{Duration, Utc};
use expo_push_notification_client::Priority;
use uuid::Uuid;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_normal_priority_respects_spacing() {
    let (_, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &pubkey, "user1@test.com", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let tracking_repo = NotificationTrackingRepository::new(&app_state.db_pool);
    let recent_time = Utc::now() - Duration::minutes(20);
    sqlx::query(
        "INSERT INTO job_status_reports (pubkey, notification_k1, report_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(pubkey.clone())
    .bind(format!("k1-{}", Uuid::new_v4()))
    .bind("Backup")
    .bind("Pending")
    .bind(recent_time)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let coordinator = NotificationCoordinator::new(app_state.clone());
    let request = NotificationRequest {
        priority: Priority::Normal,
        data: NotificationData::BackupTrigger(BackupTriggerNotification { k1: String::new() }),
        target_pubkey: Some(pubkey.clone()),
    };

    let result = coordinator.send_notification(request).await;
    assert!(result.is_ok());

    let can_send = tracking_repo
        .can_send_notification(&pubkey, 45)
        .await
        .unwrap();
    assert!(
        !can_send,
        "Should not be able to send within 45 min spacing"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_critical_priority_bypasses_spacing() {
    let (_, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &pubkey, "user2@test.com", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let recent_time = Utc::now() - Duration::minutes(5);
    sqlx::query(
        "INSERT INTO job_status_reports (pubkey, notification_k1, report_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(pubkey.clone())
    .bind(format!("k1-{}", Uuid::new_v4()))
    .bind("Backup")
    .bind("Pending")
    .bind(recent_time)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let coordinator = NotificationCoordinator::new(app_state.clone());
    let request = NotificationRequest {
        priority: Priority::High,
        data: NotificationData::Maintenance(MaintenanceNotification { k1: String::new() }),
        target_pubkey: Some(pubkey.clone()),
    };

    let result = coordinator.send_notification(request).await;
    assert!(result.is_ok());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_last_notification_time_includes_heartbeat_records() {
    let (_, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &pubkey, "user3@test.com", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let sent_at = Utc::now() - Duration::minutes(1);
    sqlx::query(
        "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(pubkey.clone())
    .bind(Uuid::new_v4().to_string())
    .bind("pending")
    .bind(sent_at)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let tracking_repo = NotificationTrackingRepository::new(&app_state.db_pool);
    let last_time = tracking_repo
        .get_last_notification_time(&pubkey)
        .await
        .unwrap();
    assert!(last_time.is_some(), "Heartbeat should count for spacing");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_eligible_users_query() {
    let (_, app_state, _guard) = setup_test_app().await;

    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0xab; 32]);
    let user3 = TestUser::new_with_key(&[0xbc; 32]);
    let pubkey1 = user1.pubkey().to_string();
    let pubkey2 = user2.pubkey().to_string();
    let pubkey3 = user3.pubkey().to_string();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &pubkey1, "user7@test.com", None)
        .await
        .unwrap();
    UserRepository::create(&mut tx, &pubkey2, "user8@test.com", None)
        .await
        .unwrap();
    UserRepository::create(&mut tx, &pubkey3, "user9@test.com", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let recent_time = Utc::now() - Duration::minutes(10);
    sqlx::query(
        "INSERT INTO job_status_reports (pubkey, notification_k1, report_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(pubkey1.clone())
    .bind(format!("k1-{}", Uuid::new_v4()))
    .bind("Maintenance")
    .bind("Pending")
    .bind(recent_time)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let old_time = Utc::now() - Duration::minutes(50);
    sqlx::query(
        "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(pubkey2.clone())
    .bind(Uuid::new_v4().to_string())
    .bind("pending")
    .bind(old_time)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let tracking_repo = NotificationTrackingRepository::new(&app_state.db_pool);
    let eligible = tracking_repo.get_eligible_users(45).await.unwrap();

    assert_eq!(eligible.len(), 2, "Should have 2 eligible users");
    assert!(
        eligible.contains(&pubkey2),
        "User2 should be eligible (old notification)"
    );
    assert!(
        eligible.contains(&pubkey3),
        "User3 should be eligible (no notifications)"
    );
    assert!(
        !eligible.contains(&pubkey1),
        "User1 should not be eligible (recent notification)"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_spacing_configuration_from_config() {
    let (_, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &pubkey, "user10@test.com", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let boundary_time = Utc::now() - Duration::minutes(45);
    sqlx::query(
        "INSERT INTO job_status_reports (pubkey, notification_k1, report_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(pubkey.clone())
    .bind(format!("k1-{}", Uuid::new_v4()))
    .bind("Maintenance")
    .bind("Pending")
    .bind(boundary_time)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let tracking_repo = NotificationTrackingRepository::new(&app_state.db_pool);
    let can_send = tracking_repo
        .can_send_notification(&pubkey, 45)
        .await
        .unwrap();
    assert!(can_send, "Should be able to send at 45 minute boundary");
}
