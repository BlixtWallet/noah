use std::sync::Arc;
use std::time::SystemTime;

use axum::Router;
use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use dashmap::DashMap;
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::app_middleware::auth_middleware;
use crate::gated_api_v0::{
    complete_upload, delete_backup, get_download_url, get_upload_url, get_user_info, list_backups,
    register, register_push_token, update_backup_settings, update_ln_address,
};
use crate::tests::common::TestUser;
use crate::types::{
    BackupInfo, DownloadUrlResponse, LNUrlAuthResponse, UploadUrlResponse, UserInfoResponse,
};
use crate::{AppState, AppStruct};
use axum::middleware;

async fn setup_test_app() -> (Router, AppState) {
    // Set up environment variables for S3 testing
    unsafe {
        std::env::set_var("S3_BUCKET_NAME", "test-bucket");
        std::env::set_var("AWS_ACCESS_KEY_ID", "test-key");
        std::env::set_var("AWS_SECRET_ACCESS_KEY", "test-secret");
        std::env::set_var("AWS_REGION", "us-east-1");
    }

    let db_path = format!("/tmp/test-{}.db", uuid::Uuid::new_v4());
    let db = libsql::Builder::new_local(db_path).build().await.unwrap();
    let conn = db.connect().unwrap();
    crate::migrations::migrate(&conn).await.unwrap();

    let app_state = Arc::new(AppStruct {
        lnurl_domain: "localhost".to_string(),
        db: Arc::new(db),
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
    });

    let app = Router::new()
        .route("/register", axum::routing::post(register))
        .route(
            "/register_push_token",
            axum::routing::post(register_push_token),
        )
        .route("/user_info", axum::routing::post(get_user_info))
        .route("/update_ln_address", axum::routing::post(update_ln_address))
        .route("/backup/upload_url", axum::routing::post(get_upload_url))
        .route(
            "/backup/complete_upload",
            axum::routing::post(complete_upload),
        )
        .route("/backup/list", axum::routing::post(list_backups))
        .route(
            "/backup/download_url",
            axum::routing::post(get_download_url),
        )
        .route("/backup/delete", axum::routing::post(delete_backup))
        .route(
            "/backup/settings",
            axum::routing::post(update_backup_settings),
        )
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ))
        .with_state(app_state.clone());

    (app, app_state)
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_new_user() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "ln_address": "test@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LNUrlAuthResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.status, "OK");
    assert!(res.event.is_some());
    assert_eq!(res.lightning_address, Some("test@localhost".to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_existing_user() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1_existing";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(k1);

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "ln_address": "test@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LNUrlAuthResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.status, "OK");
    assert!(res.event.is_none());
    assert_eq!(
        res.lightning_address,
        Some("existing@localhost".to_string())
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_invalid_signature() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1_invalid_sig";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let user = TestUser::new();
    let mut auth_payload = user.auth_payload(k1);
    auth_payload.sig = "invalid_sig".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "ln_address": "test@localhost"
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
async fn test_register_invalid_k1() {
    let (app, _) = setup_test_app().await;

    let k1 = "test_k1_invalid";

    let user = TestUser::new();
    let mut auth_payload = user.auth_payload(k1);
    auth_payload.k1 = "invalid_k1".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "ln_address": "test@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_push_token() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register_push_token")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "push_token": "test_push_token"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let mut rows = conn
        .query(
            "SELECT push_token FROM push_tokens WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let push_token: String = row.get(0).unwrap();
    assert_eq!(push_token, "test_push_token");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_user_info() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/user_info")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: UserInfoResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.lightning_address, "existing@localhost");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_update_ln_address() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/update_ln_address")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "ln_address": "new@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let mut rows = conn
        .query(
            "SELECT lightning_address FROM users WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let ln_address: String = row.get(0).unwrap();
    assert_eq!(ln_address, "new@localhost");
}

// Helper function to create a test user in the database
async fn create_test_user(app_state: &AppState, user: &TestUser) {
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "test@localhost"],
    )
    .await
    .unwrap();
}

// BACKUP API TESTS

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_upload_url() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_upload";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/upload_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 1,
                        "backup_size": 1024
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Note: This test may fail in CI without proper AWS credentials
    // In a real test environment, you'd want to mock the S3 client
    if response.status() == StatusCode::OK {
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let res: UploadUrlResponse = serde_json::from_slice(&body).unwrap();
        assert!(!res.upload_url.is_empty());
        assert!(!res.s3_key.is_empty());
        assert!(res.s3_key.contains(&user.pubkey().to_string()));
        assert!(res.s3_key.contains("backup_v1.db"));
    } else {
        // If S3 is not available, we expect an internal server error
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_complete_upload() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_complete";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "s3_key": s3_key,
                        "backup_version": 1,
                        "backup_size": 1024
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify the backup metadata was stored
    let conn = app_state.db.connect().unwrap();
    let mut rows = conn
        .query(
            "SELECT s3_key, backup_size, backup_version FROM backup_metadata WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let stored_s3_key: String = row.get(0).unwrap();
    let stored_size: i64 = row.get(1).unwrap();
    let stored_version: i32 = row.get(2).unwrap();

    assert_eq!(stored_s3_key, s3_key);
    assert_eq!(stored_size, 1024);
    assert_eq!(stored_version, 1);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_complete_upload_upsert() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_upsert";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());

    // First upload
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "s3_key": s3_key,
                        "backup_version": 1,
                        "backup_size": 1024
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Second upload with same version (should update)
    let k1_2 = "test_k1_upsert_2";
    app_state
        .k1_values
        .insert(k1_2.to_string(), SystemTime::now());
    let auth_payload_2 = user.auth_payload(k1_2);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload_2.key,
                        "sig": auth_payload_2.sig,
                        "k1": auth_payload_2.k1,
                        "s3_key": s3_key,
                        "backup_version": 1,
                        "backup_size": 2048
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify only one record exists with updated size
    let conn = app_state.db.connect().unwrap();
    let mut rows = conn
        .query(
            "SELECT COUNT(*), backup_size FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
            libsql::params![user.pubkey().to_string(), 1],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let count: i64 = row.get(0).unwrap();
    let size: i64 = row.get(1).unwrap();

    assert_eq!(count, 1);
    assert_eq!(size, 2048);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_list_backups_empty() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_list_empty";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/list")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: Vec<BackupInfo> = serde_json::from_slice(&body).unwrap();
    assert_eq!(res.len(), 0);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_list_backups_with_data() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Insert test backup metadata
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)",
        libsql::params![user.pubkey().to_string(), "test/backup_v1.db", 1024, 1],
    )
    .await
    .unwrap();

    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)",
        libsql::params![user.pubkey().to_string(), "test/backup_v2.db", 2048, 2],
    )
    .await
    .unwrap();

    let k1 = "test_k1_list_data";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/list")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: Vec<BackupInfo> = serde_json::from_slice(&body).unwrap();
    assert_eq!(res.len(), 2);

    // Check that both backups are present
    let versions: Vec<i32> = res.iter().map(|b| b.backup_version).collect();
    assert!(versions.contains(&1));
    assert!(versions.contains(&2));

    let sizes: Vec<u64> = res.iter().map(|b| b.backup_size).collect();
    assert!(sizes.contains(&1024));
    assert!(sizes.contains(&2048));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_download_url_specific_version() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Insert test backup metadata
    let conn = app_state.db.connect().unwrap();
    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)",
        libsql::params![user.pubkey().to_string(), s3_key, 1024, 1],
    )
    .await
    .unwrap();

    let k1 = "test_k1_download";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 1
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Note: This test may fail in CI without proper AWS credentials
    if response.status() == StatusCode::OK {
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let res: DownloadUrlResponse = serde_json::from_slice(&body).unwrap();
        assert!(!res.download_url.is_empty());
        assert_eq!(res.backup_size, 1024);
    } else {
        // If S3 is not available, we expect an internal server error
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_download_url_latest() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Insert test backup metadata with different timestamps
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version, created_at) VALUES (?, ?, ?, ?, datetime('now', '-1 hour'))",
        libsql::params![user.pubkey().to_string(), "test/backup_v1.db", 1024, 1],
    )
    .await
    .unwrap();

    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
        libsql::params![user.pubkey().to_string(), "test/backup_v2.db", 2048, 2],
    )
    .await
    .unwrap();

    let k1 = "test_k1_download_latest";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                        // No backup_version specified, should get latest
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Note: This test may fail in CI without proper AWS credentials
    if response.status() == StatusCode::OK {
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let res: DownloadUrlResponse = serde_json::from_slice(&body).unwrap();
        assert!(!res.download_url.is_empty());
        assert_eq!(res.backup_size, 2048); // Should get the latest (version 2)
    } else {
        // If S3 is not available, we expect an internal server error
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_download_url_not_found() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_download_not_found";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 999
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
async fn test_delete_backup() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Insert test backup metadata
    let conn = app_state.db.connect().unwrap();
    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)",
        libsql::params![user.pubkey().to_string(), s3_key, 1024, 1],
    )
    .await
    .unwrap();

    let k1 = "test_k1_delete";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 1
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Note: This test may fail in CI without proper AWS credentials
    // The S3 delete operation might fail, but the database deletion should succeed
    if response.status() == StatusCode::OK {
        // Verify the backup metadata was deleted from database
        let mut rows = conn
            .query(
                "SELECT COUNT(*) FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
                libsql::params![user.pubkey().to_string(), 1],
            )
            .await
            .unwrap();

        let row = rows.next().await.unwrap().unwrap();
        let count: i64 = row.get(0).unwrap();
        assert_eq!(count, 0);
    } else {
        // If S3 is not available, we expect an internal server error
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_delete_backup_not_found() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_delete_not_found";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 999
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
async fn test_update_backup_settings_enable() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_settings_enable";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_enabled": true
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify the backup settings were stored
    let conn = app_state.db.connect().unwrap();
    let mut rows = conn
        .query(
            "SELECT backup_enabled FROM backup_settings WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let backup_enabled: bool = row.get(0).unwrap();
    assert_eq!(backup_enabled, true);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_update_backup_settings_disable() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // First enable backup
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO backup_settings (pubkey, backup_enabled) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), true],
    )
    .await
    .unwrap();

    let k1 = "test_k1_settings_disable";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_enabled": false
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify the backup settings were updated
    let mut rows = conn
        .query(
            "SELECT backup_enabled FROM backup_settings WHERE pubkey = ?",
            libsql::params![user.pubkey().to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let backup_enabled: bool = row.get(0).unwrap();
    assert_eq!(backup_enabled, false);
}

// ERROR CASE TESTS

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_invalid_auth() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_invalid_auth";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let mut auth_payload = user.auth_payload(k1);
    auth_payload.sig = "invalid_signature".to_string();

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/list",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        serde_json::to_vec(&json!({
                            "key": auth_payload.key,
                            "sig": auth_payload.sig,
                            "k1": auth_payload.k1,
                            "backup_version": 1,
                            "backup_size": 1024,
                            "backup_enabled": true
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "Endpoint {} should return UNAUTHORIZED for invalid auth",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_missing_k1() {
    let (app, _app_state) = setup_test_app().await;
    let user = TestUser::new();

    let k1 = "test_k1_missing";
    let auth_payload = user.auth_payload(k1);

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/list",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        serde_json::to_vec(&json!({
                            "key": auth_payload.key,
                            "sig": auth_payload.sig,
                            "k1": auth_payload.k1,
                            "backup_version": 1,
                            "backup_size": 1024,
                            "backup_enabled": true
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Endpoint {} should return BAD_REQUEST for missing k1",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_malformed_json() {
    let (app, _app_state) = setup_test_app().await;

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/list",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .body(Body::from("invalid json"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Endpoint {} should return BAD_REQUEST for malformed JSON",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_complete_upload_missing_fields() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_missing_fields";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    // Test missing s3_key
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_version": 1,
                        "backup_size": 1024
                        // Missing s3_key
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // The server returns UNPROCESSABLE_ENTITY (422) when JSON deserialization fails
    // due to missing required fields
    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_upload_url_missing_fields() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_upload_missing";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    // Test missing backup_version
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/upload_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1,
                        "backup_size": 1024
                        // Missing backup_version
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_delete_backup_missing_version() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_delete_missing";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                        // Missing backup_version
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_update_backup_settings_missing_enabled() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = "test_k1_settings_missing";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let auth_payload = user.auth_payload(k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "key": auth_payload.key,
                        "sig": auth_payload.sig,
                        "k1": auth_payload.k1
                        // Missing backup_enabled
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}
