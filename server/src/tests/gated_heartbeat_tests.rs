use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::db::heartbeat_repo::HeartbeatRepository;
use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::types::DefaultSuccessPayload;
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_success() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Create a heartbeat notification first
    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/heartbeat_response")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "notification_id": notification_id
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: DefaultSuccessPayload = serde_json::from_slice(&body).unwrap();
    assert_eq!(res.success, true);

    // Verify the heartbeat was marked as responded in the database
    let mut rows = conn
        .query(
            "SELECT status, responded_at FROM heartbeat_notifications WHERE notification_id = ?",
            libsql::params![notification_id],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let status: String = row.get(0).unwrap();
    let responded_at: Option<String> = row.get(1).unwrap();

    assert_eq!(status, "responded");
    assert!(responded_at.is_some());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_invalid_notification_id() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/heartbeat_response")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "notification_id": "non-existent-notification-id"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_already_responded() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Create a heartbeat notification and mark it as already responded
    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    // Mark it as responded first
    heartbeat_repo
        .mark_as_responded(&notification_id)
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/heartbeat_response")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "notification_id": notification_id
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_unauthenticated() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Create a heartbeat notification
    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.sig = "invalid_signature".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/heartbeat_response")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "notification_id": notification_id
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_create_notification() {
    let (_, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    assert!(!notification_id.is_empty());

    // Verify the notification was created in the database
    let mut rows = conn
        .query(
            "SELECT pubkey, status FROM heartbeat_notifications WHERE notification_id = ?",
            libsql::params![notification_id],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let pubkey: String = row.get(0).unwrap();
    let status: String = row.get(1).unwrap();

    assert_eq!(pubkey, user.pubkey().to_string());
    assert_eq!(status, crate::types::HeartbeatStatus::Pending.to_string());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_count_consecutive_missed() {
    let (_, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // Create 5 old missed notifications (pending status)
    for i in 0..5 {
        conn.execute(
            "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at) VALUES (?, ?, 'pending', datetime('now', '-' || ? || ' seconds'))",
            libsql::params![user.pubkey().to_string(), format!("old-{}", i), 100 + i],
        )
        .await
        .unwrap();
    }

    // Create 1 responded notification (more recent than the old ones)
    conn.execute(
        "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at, responded_at) VALUES (?, 'responded', 'responded', datetime('now', '-50 seconds'), datetime('now', '-49 seconds'))",
        libsql::params![user.pubkey().to_string()],
    )
    .await
    .unwrap();

    // Create 3 most recent missed notifications
    for i in 0..3 {
        conn.execute(
            "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at) VALUES (?, ?, 'pending', datetime('now', '-' || ? || ' seconds'))",
            libsql::params![user.pubkey().to_string(), format!("recent-{}", i), 10 + i],
        )
        .await
        .unwrap();
    }

    // Should count only the 3 most recent missed notifications
    let consecutive_missed = heartbeat_repo
        .count_consecutive_missed(&user.pubkey().to_string())
        .await
        .unwrap();

    assert_eq!(consecutive_missed, 3);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_get_users_to_deregister() {
    let (_, app_state) = setup_test_app().await;

    // Create users with different secret keys
    let user1 = TestUser::new_with_key(&[0xcd; 32]);
    let user2 = TestUser::new_with_key(&[0xab; 32]);

    // Create users with unique lightning addresses
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user1.pubkey().to_string(), "user1@localhost"],
    )
    .await
    .unwrap();

    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user2.pubkey().to_string(), "user2@localhost"],
    )
    .await
    .unwrap();

    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // User1: Create 10 missed notifications (should be deregistered)
    for _ in 0..10 {
        heartbeat_repo
            .create_notification(&user1.pubkey().to_string())
            .await
            .unwrap();
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    // User2: Create 5 missed notifications (should NOT be deregistered)
    for _ in 0..5 {
        heartbeat_repo
            .create_notification(&user2.pubkey().to_string())
            .await
            .unwrap();
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    let users_to_deregister = heartbeat_repo.get_users_to_deregister().await.unwrap();

    assert_eq!(users_to_deregister.len(), 1);
    assert_eq!(users_to_deregister[0], user1.pubkey().to_string());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_cleanup_old_notifications() {
    let (_, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // Create 20 notifications (more than the 15 limit)
    for _ in 0..20 {
        heartbeat_repo
            .create_notification(&user.pubkey().to_string())
            .await
            .unwrap();
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    // Cleanup old notifications
    heartbeat_repo.cleanup_old_notifications().await.unwrap();

    // Verify only 15 notifications remain
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let count: i32 = row.get(0).unwrap();

    assert_eq!(count, 15);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_notification() {
    let (_, app_state) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // Create a heartbeat notification
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    // Verify it exists
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE notification_id = ?",
            libsql::params![notification_id.clone()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let count: i32 = row.get(0).unwrap();
    assert_eq!(count, 1);

    // Delete the notification
    heartbeat_repo
        .delete_notification(&notification_id)
        .await
        .unwrap();

    // Verify it no longer exists
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE notification_id = ?",
            libsql::params![notification_id.clone()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let count: i32 = row.get(0).unwrap();
    assert_eq!(count, 0);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_nonexistent_notification() {
    let (_, app_state) = setup_test_app().await;

    let conn = app_state.db.connect().unwrap();
    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // Attempt to delete a non-existent notification - should not error
    let result = heartbeat_repo
        .delete_notification("non-existent-notification-id")
        .await;

    assert!(result.is_ok());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_by_pubkey() {
    let (_, app_state) = setup_test_app().await;

    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0xab; 32]);
    create_test_user(&app_state, &user1).await;

    // Create user2 with unique lightning address
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user2.pubkey().to_string(), "user2@localhost"],
    )
    .await
    .unwrap();

    let heartbeat_repo = HeartbeatRepository::new(&conn);

    // Create multiple heartbeat notifications for user1
    let _notification_id1 = heartbeat_repo
        .create_notification(&user1.pubkey().to_string())
        .await
        .unwrap();
    let _notification_id2 = heartbeat_repo
        .create_notification(&user1.pubkey().to_string())
        .await
        .unwrap();

    // Create a heartbeat notification for user2
    let _notification_id3 = heartbeat_repo
        .create_notification(&user2.pubkey().to_string())
        .await
        .unwrap();

    // Verify all notifications exist
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = ?",
            libsql::params![user1.pubkey().to_string()],
        )
        .await
        .unwrap();
    let row = rows.next().await.unwrap().unwrap();
    let count1: i32 = row.get(0).unwrap();
    assert_eq!(count1, 2);

    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = ?",
            libsql::params![user2.pubkey().to_string()],
        )
        .await
        .unwrap();
    let row = rows.next().await.unwrap().unwrap();
    let count2: i32 = row.get(0).unwrap();
    assert_eq!(count2, 1);

    // Delete all heartbeat notifications for user1
    heartbeat_repo
        .delete_by_pubkey(&user1.pubkey().to_string())
        .await
        .unwrap();

    // Verify user1's notifications are deleted
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = ?",
            libsql::params![user1.pubkey().to_string()],
        )
        .await
        .unwrap();
    let row = rows.next().await.unwrap().unwrap();
    let count1_after: i32 = row.get(0).unwrap();
    assert_eq!(count1_after, 0);

    // Verify user2's notifications are still there
    let mut rows = conn
        .query(
            "SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = ?",
            libsql::params![user2.pubkey().to_string()],
        )
        .await
        .unwrap();
    let row = rows.next().await.unwrap().unwrap();
    let count2_after: i32 = row.get(0).unwrap();
    assert_eq!(count2_after, 1);
}
