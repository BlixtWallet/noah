use std::sync::Arc;
use std::time::SystemTime;

use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use axum::{Router, middleware, routing::post};
use dashmap::DashMap;
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::app_middleware::auth_middleware;
use crate::db::{
    backup_repo::BackupRepository, job_status_repo::JobStatusRepository,
    offboarding_repo::OffboardingRepository, push_token_repo::PushTokenRepository,
    user_repo::UserRepository,
};
use crate::gated_api_v0::{
    complete_upload, delete_backup, deregister, get_download_url, get_upload_url, get_user_info,
    list_backups, register_offboarding_request, register_push_token, report_job_status,
    update_backup_settings, update_ln_address,
};
use crate::public_api_v0::register;
use crate::tests::common::TestUser;
use crate::types::{
    BackupInfo, DownloadUrlResponse, RegisterOffboardingResponse, RegisterResponse,
    ReportJobStatusPayload, ReportStatus, ReportType, UploadUrlResponse, UserInfoResponse,
};
use crate::utils::make_k1;
use crate::{AppState, AppStruct};

async fn setup_test_app() -> (Router, AppState) {
    // Set up environment variables for S3 testing
    unsafe {
        std::env::set_var("S3_BUCKET_NAME", "test-bucket");
        std::env::set_var("AWS_ACCESS_KEY_ID", "test-key");
        std::env::set_var("AWS_SECRET_ACCESS_KEY", "test-secret");
        std::env::set_var("AWS_REGION", "us-east-1");
    }

    let db_path = format!("/tmp/test-{}.db", rand::random::<u64>());
    let db = libsql::Builder::new_local(db_path).build().await.unwrap();
    let conn = db.connect().unwrap();
    crate::migrations::migrate(&conn).await.unwrap();

    let app_state = Arc::new(AppStruct {
        lnurl_domain: "localhost".to_string(),
        db: Arc::new(db),
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
        expo_access_token: "test-expo-access-token".to_string(),
    });

    let app = Router::new()
        .route("/register", post(register))
        .route("/register_push_token", post(register_push_token))
        .route(
            "/register_offboarding_request",
            post(register_offboarding_request),
        )
        .route("/user_info", post(get_user_info))
        .route("/update_ln_address", post(update_ln_address))
        .route("/deregister", post(deregister))
        .route("/backup/upload_url", post(get_upload_url))
        .route("/backup/complete_upload", post(complete_upload))
        .route("/backup/list", post(list_backups))
        .route("/backup/download_url", post(get_download_url))
        .route("/backup/delete", post(delete_backup))
        .route("/backup/settings", post(update_backup_settings))
        .route("/report_job_status", post(report_job_status))
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

    let k1 = make_k1(app_state.k1_values.clone());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let res: RegisterResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.status, "OK");
    assert!(res.event.is_some());
    assert_eq!(res.lightning_address, Some("test@localhost".to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_existing_user() {
    let (app, app_state) = setup_test_app().await;

    let k1 = make_k1(app_state.k1_values.clone());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(&k1);

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
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let res: RegisterResponse = serde_json::from_slice(&body).unwrap();

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

    let k1 = make_k1(app_state.k1_values.clone());

    let user = TestUser::new();
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.sig = "invalid_sig".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let (app, app_state) = setup_test_app().await;

    let k1 = make_k1(app_state.k1_values.clone());

    let user = TestUser::new();
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.k1 = "invalid_k1".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register_push_token")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "push_token": "test_push_token"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verification: Check for token with the repository
    let push_token_repo = PushTokenRepository::new(&conn);
    let token = push_token_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(token, "test_push_token");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_user_info() {
    let (app, app_state) = setup_test_app().await;

    let user = TestUser::new();

    // Setup: Create user with the repository
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &user.pubkey().to_string(), "existing@localhost")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/user_info")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
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

    // Setup: Create user with the repository
    let conn = app_state.db.connect().unwrap();
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &user.pubkey().to_string(), "existing@localhost")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/update_ln_address")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "new@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verification: Check for updated address with the repository
    let user_repo = UserRepository::new(&conn);
    let updated_user = user_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        updated_user.lightning_address,
        Some("new@localhost".to_string())
    );
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/upload_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "backup_version": 1
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let backup_repo = BackupRepository::new(&conn);
    let metadata = backup_repo
        .find_by_pubkey_and_version(&user.pubkey().to_string(), 1)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(metadata.s3_key, s3_key);
    assert_eq!(metadata.backup_size, 1024);
    assert_eq!(metadata.backup_version, 1);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_complete_upload_upsert() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let s3_key = format!("{}/backup_v1.db", user.pubkey().to_string());

    // First upload
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let k1_2 = make_k1(app_state.k1_values.clone());
    let auth_payload_2 = user.auth_payload(&k1_2);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_2.key)
                .header("x-auth-sig", auth_payload_2.sig)
                .header("x-auth-k1", auth_payload_2.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    // Verify the record was updated
    let conn = app_state.db.connect().unwrap();
    let backup_repo = BackupRepository::new(&conn);
    let metadata = backup_repo
        .find_by_pubkey_and_version(&user.pubkey().to_string(), 1)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(metadata.backup_size, 2048);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_list_backups_empty() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/list")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
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
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), "test/backup_v1.db", 1024, 1)
        .await
        .unwrap();
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), "test/backup_v2.db", 2048, 2)
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/list")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
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
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), &s3_key, 1024, 1)
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let backup_repo = BackupRepository::new(&conn);
    use chrono::{Duration, Utc};
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let one_hour_ago = (Utc::now() - Duration::hours(1))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    backup_repo
        .upsert_metadata_with_timestamp(
            &user.pubkey().to_string(),
            "test/backup_v1.db",
            1024,
            1,
            &one_hour_ago,
        )
        .await
        .unwrap();
    backup_repo
        .upsert_metadata_with_timestamp(
            &user.pubkey().to_string(),
            "test/backup_v2.db",
            2048,
            2,
            &now,
        )
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(serde_json::to_vec(&json!({})).unwrap()))
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/download_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), &s3_key, 1024, 1)
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
        let backup_repo = BackupRepository::new(&conn);
        let metadata = backup_repo
            .find_by_pubkey_and_version(&user.pubkey().to_string(), 1)
            .await
            .unwrap();
        assert!(metadata.is_none());
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let backup_repo = BackupRepository::new(&conn);
    let backup_enabled = backup_repo
        .get_settings(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
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
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_settings(&user.pubkey().to_string(), true)
        .await
        .unwrap();

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
    let backup_repo = BackupRepository::new(&conn);
    let backup_enabled = backup_repo
        .get_settings(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(backup_enabled, false);
}

// ERROR CASE TESTS

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_invalid_auth() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let mut auth_payload = user.auth_payload(&k1);
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
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from(
                        serde_json::to_vec(&json!({
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
    let (app, _) = setup_test_app().await;
    let user = TestUser::new();

    let k1 = "k1_not_in_state".to_string();
    let auth_payload = user.auth_payload(&k1);

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
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from(
                        serde_json::to_vec(&json!({
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
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;
    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
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
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    // Test missing s3_key
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    // Test missing backup_version
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/upload_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
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

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_expired_k1() {
    let (app, app_state) = setup_test_app().await;

    let k1_hex = "5a9b8f7c6d5e4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e";
    let old_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - 700; // 700 seconds ago, more than 10 minutes
    let k1 = format!("{}_{}", k1_hex, old_timestamp);

    app_state.k1_values.insert(k1.clone(), SystemTime::now());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
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
async fn test_register_offboarding_request() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register_offboarding_request")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: RegisterOffboardingResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.success, true);
    assert!(!res.request_id.is_empty());

    // Verify the offboarding request was stored in the database
    let conn = app_state.db.connect().unwrap();
    let offboarding_repo = OffboardingRepository::new(&conn);
    let request = offboarding_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();

    assert_eq!(request.request_id, res.request_id);
    assert_eq!(request.pubkey, user.pubkey().to_string());
    assert_eq!(request.status, "pending");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_offboarding_request_invalid_auth() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    let k1 = make_k1(app_state.k1_values.clone());
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.sig = "invalid_signature".to_string();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register_offboarding_request")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_deregister_user() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    let conn = app_state.db.connect().unwrap();

    // 1. Create user and associated data using repositories
    let tx = conn.transaction().await.unwrap();
    UserRepository::create(&tx, &user.pubkey().to_string(), "test@localhost")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let push_token_repo = PushTokenRepository::new(&conn);
    push_token_repo
        .upsert(&user.pubkey().to_string(), "test_push_token")
        .await
        .unwrap();

    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), "test_s3_key", 1024, 1)
        .await
        .unwrap();
    backup_repo
        .upsert_settings(&user.pubkey().to_string(), true)
        .await
        .unwrap();

    let offboarding_repo = OffboardingRepository::new(&conn);
    offboarding_repo
        .create_request("test_request_id", &user.pubkey().to_string())
        .await
        .unwrap();

    // 2. Call deregister endpoint
    let k1 = make_k1(app_state.k1_values.clone());
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/deregister")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // 3. Verify data is deleted from the correct places
    let push_token_repo = PushTokenRepository::new(&conn);
    let token = push_token_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(token.is_none(), "Push token should be deleted");

    let offboarding_repo = OffboardingRepository::new(&conn);
    let request = offboarding_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(request.is_none(), "Offboarding request should be deleted");

    // 4. Verify data is NOT deleted from other tables
    let user_repo = UserRepository::new(&conn);
    let user_record = user_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(user_record.is_some(), "User should not be deleted");

    let backup_repo = BackupRepository::new(&conn);
    let metadata = backup_repo
        .find_by_pubkey_and_version(&user.pubkey().to_string(), 1)
        .await
        .unwrap();
    assert!(metadata.is_some(), "Backup metadata should not be deleted");

    let settings = backup_repo
        .get_settings(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(settings.is_some(), "Backup settings should not be deleted");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_report_job_status_pruning() {
    let (app, app_state) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user).await;

    // Report job status 23 times
    for i in 0..23 {
        let k1 = make_k1(app_state.k1_values.clone());
        let auth_payload = user.auth_payload(&k1);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri("/report_job_status")
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from(
                        serde_json::to_vec(&ReportJobStatusPayload {
                            report_type: ReportType::Maintenance,
                            status: ReportStatus::Failure,
                            error_message: Some(format!("Report {}", i)),
                        })
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Add small delay
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    // Verify that only 20 reports are stored in the database
    let conn = app_state.db.connect().unwrap();
    let count = JobStatusRepository::count_by_pubkey(&conn, &user.pubkey().to_string())
        .await
        .unwrap();
    assert_eq!(count, 20);

    // Verify that the remaining reports are the last 20
    let messages = JobStatusRepository::find_error_messages_by_pubkey_ordered(
        &conn,
        &user.pubkey().to_string(),
    )
    .await
    .unwrap();

    assert_eq!(
        messages,
        vec![
            "Report 3",
            "Report 4",
            "Report 5",
            "Report 6",
            "Report 7",
            "Report 8",
            "Report 9",
            "Report 10",
            "Report 11",
            "Report 12",
            "Report 13",
            "Report 14",
            "Report 15",
            "Report 16",
            "Report 17",
            "Report 18",
            "Report 19",
            "Report 20",
            "Report 21",
            "Report 22"
        ]
    );
}
