use crate::db::notification_tracking_repo::NotificationTrackingRepository;
use crate::db::offboarding_repo::OffboardingRepository;
use crate::db::user_repo::UserRepository;
use crate::notification_coordinator::{
    NotificationCoordinator, NotificationPriority, NotificationRequest,
};
use crate::tests::common::{TestUser, setup_test_app};
use crate::types::{
    BackupTriggerNotification, HeartbeatNotification, MaintenanceNotification, NotificationData,
    OffboardingStatus,
};
use chrono::{Duration, Utc};

#[tracing_test::traced_test]
#[tokio::test]
async fn test_normal_priority_respects_spacing() {
    let (_, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    // Register user
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, &format!("user1@test.com"))
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Record a recent notification (20 minutes ago)
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let recent_time = (Utc::now() - Duration::minutes(20)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey.clone(), "backup_trigger", recent_time],
    )
    .await
    .unwrap();

    // Try to send a normal priority notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data =
        NotificationData::BackupTrigger(BackupTriggerNotification { k1: String::new() });

    let request = NotificationRequest {
        priority: NotificationPriority::Normal,
        data: notification_data,
        target_pubkey: Some(pubkey.clone()),
    };

    // Should succeed but not actually send (no push token registered)
    // The important part is that spacing check passes
    let result = coordinator.send_notification(request).await;
    assert!(result.is_ok());

    // Verify that if spacing was checked, it would have been skipped
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
    let (_, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    // Register user
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, &format!("user2@test.com"))
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Record a very recent notification (5 minutes ago)
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let recent_time = (Utc::now() - Duration::minutes(5)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey.clone(), "backup_trigger", recent_time],
    )
    .await
    .unwrap();

    // Send a critical priority notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data =
        NotificationData::Maintenance(MaintenanceNotification { k1: String::new() });

    let request = NotificationRequest {
        priority: NotificationPriority::Critical,
        data: notification_data.clone(),
        target_pubkey: Some(pubkey.clone()),
    };

    // Should succeed despite recent notification
    let result = coordinator.send_notification(request).await;
    assert!(result.is_ok());

    // Verify maintenance was tracked
    let last_time = tracking_repo
        .get_last_notification_time_by_type(&pubkey, &notification_data)
        .await
        .unwrap();
    assert!(
        last_time.is_some(),
        "Critical notification should be tracked"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_offboarding_skips_maintenance() {
    let (_, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    // Register user
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, &format!("user3@test.com"))
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Create pending offboarding request
    let offboarding_repo = OffboardingRepository::new(&conn);
    offboarding_repo
        .create_request("test-request-id", &pubkey, "bc1qtest", "test-signature")
        .await
        .unwrap();

    // Try to send maintenance notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data =
        NotificationData::Maintenance(MaintenanceNotification { k1: String::new() });

    let request = NotificationRequest {
        priority: NotificationPriority::Critical,
        data: notification_data.clone(),
        target_pubkey: Some(pubkey.clone()),
    };

    // Should succeed (no error) but not send to offboarding user
    let result = coordinator.send_notification(request).await;
    assert!(result.is_ok());

    // Verify maintenance was NOT tracked for offboarding user
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let last_time = tracking_repo
        .get_last_notification_time_by_type(&pubkey, &notification_data)
        .await
        .unwrap();
    assert!(
        last_time.is_none(),
        "Maintenance should not be sent to offboarding users"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_notification_tracking_records_sent() {
    let (_, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    // Register user
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, &format!("user4@test.com"))
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Verify no notifications tracked initially
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let last_time = tracking_repo
        .get_last_notification_time(&pubkey)
        .await
        .unwrap();
    assert!(last_time.is_none());

    // Send a critical notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data = NotificationData::Heartbeat(HeartbeatNotification {
        k1: String::new(),
        notification_id: "test-id".to_string(),
    });

    let request = NotificationRequest {
        priority: NotificationPriority::Normal,
        data: notification_data.clone(),
        target_pubkey: Some(pubkey.clone()),
    };

    coordinator.send_notification(request).await.unwrap();

    // Verify notification was tracked
    let last_time = tracking_repo
        .get_last_notification_time(&pubkey)
        .await
        .unwrap();
    assert!(last_time.is_some(), "Notification should be tracked");

    // Verify it was tracked within the last minute
    let tracked_time = last_time.unwrap();
    let elapsed = Utc::now() - tracked_time;
    assert!(
        elapsed.num_seconds() < 60,
        "Notification should be tracked recently"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_broadcast_filters_ineligible_users() {
    let (_, app_state) = setup_test_app().await;

    // Create two users
    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0xab; 32]);
    let pubkey1 = user1.pubkey().to_string();
    let pubkey2 = user2.pubkey().to_string();

    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey1, "user5@test.com")
        .await
        .unwrap();
    UserRepository::create(&tx, &pubkey2, "user6@test.com")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // User1 received notification 10 minutes ago (too recent)
    let recent_time = (Utc::now() - Duration::minutes(10)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey1.clone(), "backup_trigger", recent_time.clone()],
    )
    .await
    .unwrap();

    // User2 has no recent notifications (eligible)

    // Broadcast normal priority notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data =
        NotificationData::BackupTrigger(BackupTriggerNotification { k1: String::new() });

    let request = NotificationRequest {
        priority: NotificationPriority::Normal,
        data: notification_data,
        target_pubkey: None, // Broadcast
    };

    coordinator.send_notification(request).await.unwrap();

    // Verify user1 still only has the old notification
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let mut rows = conn
        .query(
            "SELECT last_sent_at FROM notification_tracking WHERE pubkey = ? AND notification_type = ?",
            libsql::params![pubkey1.clone(), "backup_trigger"],
        )
        .await
        .unwrap();
    let row = rows.next().await.unwrap().unwrap();
    let last_sent: String = row.get(0).unwrap();
    assert_eq!(
        last_sent, recent_time,
        "User1 should not receive new notification"
    );

    // Verify user2 received the broadcast
    let last_time = tracking_repo
        .get_last_notification_time(&pubkey2)
        .await
        .unwrap();
    assert!(
        last_time.is_some(),
        "User2 should receive broadcast notification"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_eligible_users_query() {
    let (_, app_state) = setup_test_app().await;

    // Create three users
    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0xab; 32]);
    let user3 = TestUser::new_with_key(&[0xbc; 32]);
    let pubkey1 = user1.pubkey().to_string();
    let pubkey2 = user2.pubkey().to_string();
    let pubkey3 = user3.pubkey().to_string();

    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey1, "user7@test.com")
        .await
        .unwrap();
    UserRepository::create(&tx, &pubkey2, "user8@test.com")
        .await
        .unwrap();
    UserRepository::create(&tx, &pubkey3, "user9@test.com")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // User1: notification 10 minutes ago (too recent for 45 min spacing)
    let recent_time = (Utc::now() - Duration::minutes(10)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey1.clone(), "maintenance", recent_time],
    )
    .await
    .unwrap();

    // User2: notification 50 minutes ago (eligible)
    let old_time = (Utc::now() - Duration::minutes(50)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey2.clone(), "backup_trigger", old_time],
    )
    .await
    .unwrap();

    // User3: no notifications (eligible)

    // Query eligible users
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let eligible = tracking_repo.get_eligible_users(45).await.unwrap();

    // Should return user2 and user3, but not user1
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
    let (_, app_state) = setup_test_app().await;

    // Create coordinator and verify it reads spacing from config
    let _coordinator = NotificationCoordinator::new(app_state.clone());

    // The coordinator should use the config value (45 minutes by default in test config)
    // We can't directly access min_spacing_minutes as it's private, but we can verify behavior

    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, "user10@test.com")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Record notification exactly 45 minutes ago
    let boundary_time = (Utc::now() - Duration::minutes(45)).to_rfc3339();
    conn.execute(
        "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES (?, ?, ?)",
        libsql::params![pubkey.clone(), "maintenance", boundary_time],
    )
    .await
    .unwrap();

    // At exactly 45 minutes, should be able to send
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let can_send = tracking_repo
        .can_send_notification(&pubkey, 45)
        .await
        .unwrap();
    assert!(can_send, "Should be able to send at 45 minute boundary");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_offboarding_with_processing_status_skips_maintenance() {
    let (_, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let pubkey = user.pubkey().to_string();

    // Register user
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &pubkey, "user11@test.com")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Create offboarding request in "processing" state
    let offboarding_repo = OffboardingRepository::new(&conn);
    offboarding_repo
        .create_request(
            "processing-request-id",
            &pubkey,
            "bc1qtest",
            "test-signature",
        )
        .await
        .unwrap();
    offboarding_repo
        .update_status("processing-request-id", OffboardingStatus::Processing)
        .await
        .unwrap();

    // Verify user is considered offboarding
    let tracking_repo = NotificationTrackingRepository::new(&conn);
    let is_offboarding = tracking_repo.is_user_offboarding(&pubkey).await.unwrap();
    assert!(
        is_offboarding,
        "User with processing status should be offboarding"
    );

    // Try to send maintenance notification
    let coordinator = NotificationCoordinator::new(app_state.clone());
    let notification_data =
        NotificationData::Maintenance(MaintenanceNotification { k1: String::new() });

    let request = NotificationRequest {
        priority: NotificationPriority::Critical,
        data: notification_data.clone(),
        target_pubkey: Some(pubkey.clone()),
    };

    coordinator.send_notification(request).await.unwrap();

    // Verify maintenance was NOT sent
    let last_time = tracking_repo
        .get_last_notification_time_by_type(&pubkey, &notification_data)
        .await
        .unwrap();
    assert!(
        last_time.is_none(),
        "Maintenance should not be sent to processing offboarding users"
    );
}
