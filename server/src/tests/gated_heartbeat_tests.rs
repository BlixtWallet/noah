use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::db::heartbeat_repo::HeartbeatRepository;
use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::types::{DefaultSuccessPayload, HeartbeatStatus};
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_success() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    // Create a heartbeat notification first
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    assert!(res.success);

    // Verify the heartbeat was marked as responded in the database
    let (status, responded_at): (String, Option<chrono::DateTime<Utc>>) = sqlx::query_as(
        "SELECT status, responded_at FROM heartbeat_notifications WHERE notification_id = $1",
    )
    .bind(&notification_id)
    .fetch_one(&app_state.db_pool)
    .await
    .unwrap();

    assert_eq!(status, "responded");
    assert!(responded_at.is_some());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_response_invalid_notification_id() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    // Create a heartbeat notification and mark it as already responded
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    // Mark it as responded first
    heartbeat_repo
        .mark_as_responded(&notification_id)
        .await
        .unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    // Create a heartbeat notification
    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let (_, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    assert!(!notification_id.is_empty());

    let (pubkey, status): (String, String) = sqlx::query_as(
        "SELECT pubkey, status FROM heartbeat_notifications WHERE notification_id = $1",
    )
    .bind(&notification_id)
    .fetch_one(&app_state.db_pool)
    .await
    .unwrap();

    assert_eq!(pubkey, user.pubkey().to_string());
    assert_eq!(status, HeartbeatStatus::Pending.to_string());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_count_consecutive_missed() {
    let (_, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    for i in 0..5 {
        let sent_at = Utc::now() - Duration::seconds((100 + i) as i64);
        sqlx::query(
            "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(user.pubkey().to_string())
        .bind(format!("old-{}", i))
        .bind(HeartbeatStatus::Pending.to_string())
        .bind(sent_at)
        .execute(&app_state.db_pool)
        .await
        .unwrap();
    }

    let responded_sent_at = Utc::now() - Duration::seconds(50);
    sqlx::query(
        "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at, responded_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(user.pubkey().to_string())
    .bind("responded")
    .bind(HeartbeatStatus::Responded.to_string())
    .bind(responded_sent_at)
    .bind(responded_sent_at + Duration::seconds(1))
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    for i in 0..3 {
        let sent_at = Utc::now() - Duration::seconds((10 + i) as i64);
        sqlx::query(
            "INSERT INTO heartbeat_notifications (pubkey, notification_id, status, sent_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(user.pubkey().to_string())
        .bind(format!("recent-{}", i))
        .bind(HeartbeatStatus::Pending.to_string())
        .bind(sent_at)
        .execute(&app_state.db_pool)
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
    let (_, app_state, _guard) = setup_test_app().await;

    // Create users with different secret keys
    let user1 = TestUser::new_with_key(&[0xcd; 32]);
    let user2 = TestUser::new_with_key(&[0xab; 32]);

    // Create users with unique lightning addresses
    sqlx::query("INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, NULL)")
        .bind(user1.pubkey().to_string())
        .bind("user1@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, NULL)")
        .bind(user2.pubkey().to_string())
        .bind("user2@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

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
    let (_, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

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
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();

    assert_eq!(count, 15);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_notification() {
    let (_, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    // Create a heartbeat notification
    let notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    // Verify it exists
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM heartbeat_notifications WHERE notification_id = $1",
    )
    .bind(notification_id.clone())
    .fetch_one(&app_state.db_pool)
    .await
    .unwrap();
    assert_eq!(count, 1);

    // Delete the notification
    heartbeat_repo
        .delete_notification(&notification_id)
        .await
        .unwrap();

    // Verify it no longer exists
    let count_after: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM heartbeat_notifications WHERE notification_id = $1",
    )
    .bind(notification_id.clone())
    .fetch_one(&app_state.db_pool)
    .await
    .unwrap();
    assert_eq!(count_after, 0);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_nonexistent_notification() {
    let (_, app_state, _guard) = setup_test_app().await;

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

    // Attempt to delete a non-existent notification - should not error
    let result = heartbeat_repo
        .delete_notification("non-existent-notification-id")
        .await;

    assert!(result.is_ok());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_heartbeat_repo_delete_by_pubkey() {
    let (_, app_state, _guard) = setup_test_app().await;

    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0xab; 32]);
    create_test_user(&app_state, &user1, None).await;

    // Create user2 with unique lightning address
    sqlx::query("INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, NULL)")
        .bind(user2.pubkey().to_string())
        .bind("user2@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);

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
    let count1: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user1.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();
    assert_eq!(count1, 2);

    let count2: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user2.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();
    assert_eq!(count2, 1);

    // Delete all heartbeat notifications for user1
    let mut tx = app_state.db_pool.begin().await.unwrap();
    HeartbeatRepository::delete_by_pubkey_tx(&mut tx, &user1.pubkey().to_string())
        .await
        .unwrap();
    tx.commit().await.unwrap();

    // Verify user1's notifications are deleted
    let count1_after: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user1.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();
    assert_eq!(count1_after, 0);

    // Verify user2's notifications are still there
    let count2_after: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user2.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();
    assert_eq!(count2_after, 1);
}
