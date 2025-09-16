use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::db::backup_repo::BackupRepository;
use crate::db::offboarding_repo::OffboardingRepository;
use crate::db::push_token_repo::PushTokenRepository;
use crate::db::user_repo::UserRepository;
use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::types::{RegisterOffboardingResponse, UserInfoResponse};
use crate::utils::make_k1;

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

    use crate::db::job_status_repo::JobStatusRepository;
    use crate::types::{ReportJobStatusPayload, ReportStatus, ReportType};

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
