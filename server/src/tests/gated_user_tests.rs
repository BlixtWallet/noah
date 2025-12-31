use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::db::backup_repo::BackupRepository;
use crate::db::heartbeat_repo::HeartbeatRepository;
use crate::db::offboarding_repo::OffboardingRepository;
use crate::db::push_token_repo::PushTokenRepository;
use crate::db::user_repo::UserRepository;
use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::types::{RegisterOffboardingResponse, UserInfoResponse};
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_user_info() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    // Setup: Create user with the repository
    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(
        &mut tx,
        &user.pubkey().to_string(),
        "existing@localhost",
        None,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    // Setup: Create user with the repository
    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(
        &mut tx,
        &user.pubkey().to_string(),
        "existing@localhost",
        None,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let user_repo = UserRepository::new(&app_state.db_pool);
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
                .uri("/register_offboarding_request")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key)
                .header("x-auth-sig", auth_payload.sig)
                .header("x-auth-k1", auth_payload.k1)
                .body(Body::from(
                    json!({
                        "address": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                        "address_signature": "mock_signature_for_testing"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: RegisterOffboardingResponse = serde_json::from_slice(&body).unwrap();

    assert!(res.success);
    assert!(!res.request_id.is_empty());

    // Verify the offboarding request was stored in the database
    let offboarding_repo = OffboardingRepository::new(&app_state.db_pool);
    let request = offboarding_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();

    assert_eq!(request.request_id, res.request_id);
    assert_eq!(request.pubkey, user.pubkey().to_string());
    assert_eq!(request.status, crate::types::OffboardingStatus::Pending);
    assert_eq!(
        request.address,
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_offboarding_request_invalid_auth() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    // 1. Create user and associated data using repositories
    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(&mut tx, &user.pubkey().to_string(), "test@localhost", None)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let push_token_repo = PushTokenRepository::new(&app_state.db_pool);
    push_token_repo
        .upsert(&user.pubkey().to_string(), "test_push_token")
        .await
        .unwrap();

    let backup_repo = BackupRepository::new(&app_state.db_pool);
    backup_repo
        .upsert_metadata(&user.pubkey().to_string(), "test_s3_key", 1024, 1)
        .await
        .unwrap();
    backup_repo
        .upsert_settings(&user.pubkey().to_string(), true)
        .await
        .unwrap();

    let offboarding_repo = OffboardingRepository::new(&app_state.db_pool);
    offboarding_repo
        .create_request(
            "test_request_id",
            &user.pubkey().to_string(),
            "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
            "mock_signature_for_testing",
        )
        .await
        .unwrap();

    let heartbeat_repo = HeartbeatRepository::new(&app_state.db_pool);
    let _heartbeat_notification_id = heartbeat_repo
        .create_notification(&user.pubkey().to_string())
        .await
        .unwrap();

    // 2. Call deregister endpoint
    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
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
    let push_token_repo = PushTokenRepository::new(&app_state.db_pool);
    let token = push_token_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(token.is_none(), "Push token should be deleted");

    let offboarding_repo = OffboardingRepository::new(&app_state.db_pool);
    let request = offboarding_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(request.is_none(), "Offboarding request should be deleted");

    // 4. Verify data is NOT deleted from other tables
    let user_repo = UserRepository::new(&app_state.db_pool);
    let user_record = user_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(user_record.is_some(), "User should not be deleted");

    let backup_repo = BackupRepository::new(&app_state.db_pool);
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

    // 5. Verify heartbeat notifications are deleted
    let heartbeat_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(user.pubkey().to_string())
            .fetch_one(&app_state.db_pool)
            .await
            .unwrap();
    assert_eq!(
        heartbeat_count, 0,
        "Heartbeat notifications should be deleted"
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_report_job_status_pruning() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    use crate::db::job_status_repo::JobStatusRepository;
    use crate::types::{ReportJobStatusPayload, ReportStatus, ReportType};

    // Report job status 23 times
    for i in 0..23 {
        let k1 = make_k1(&app_state.k1_cache)
            .await
            .expect("failed to create k1");
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
    let count =
        JobStatusRepository::count_by_pubkey(&app_state.db_pool, &user.pubkey().to_string())
            .await
            .unwrap();
    assert_eq!(count, 20);

    // Verify that the remaining reports are the last 20
    let messages = JobStatusRepository::find_error_messages_by_pubkey_ordered(
        &app_state.db_pool,
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

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_new_user_with_ark_address() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    let ark_address = Some(
        "tark1p0qtgclpzqqppvmzrkt3kyyqd4lv3jxex32zagcu0fwfm4dkr8ud58h5ej53u4wcpqqtzhwd8"
            .to_string(),
    );

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "newuserark@localhost",
                        "ark_address": ark_address,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify ark_address in DB
    let user_repo = UserRepository::new(&app_state.db_pool);
    let registered_user = user_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(registered_user.ark_address, ark_address);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_existing_user_update_ark_address() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await; // Register without ark_address

    let new_ark_address =
        Some("tark1newarkaddress1234567890abcdefghijklmnopqrstuvwxyza".to_string());

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "existinguserark@localhost", // Can be same or different
                        "ark_address": new_ark_address,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify ark_address is updated in DB
    let user_repo = UserRepository::new(&app_state.db_pool);
    let updated_user = user_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(updated_user.ark_address, new_ark_address);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_ark_address_taken() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0x01; 32]);
    let taken_ark_address = Some(
        "tark1p0qtgclpzqqppvmzrkt3kyyqd4lv3jxex32zagcu0fwfm4dkr8ud58h5ej53u4wcpqqtzhwd8"
            .to_string(),
    );

    // Register user1 with the ark_address
    let k1_1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_1 = user1.auth_payload(&k1_1);
    let response1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_1.key.clone())
                .header("x-auth-sig", auth_payload_1.sig.clone())
                .header("x-auth-k1", auth_payload_1.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "user1ark@localhost",
                        "ark_address": taken_ark_address,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response1.status(), StatusCode::OK);

    // Try to register user2 with the same ark_address
    let k1_2 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_2 = user2.auth_payload(&k1_2);
    let response2 = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_2.key.clone())
                .header("x-auth-sig", auth_payload_2.sig.clone())
                .header("x-auth-k1", auth_payload_2.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "user2ark@localhost",
                        "ark_address": taken_ark_address,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response2.status(), StatusCode::BAD_REQUEST);
    let body = response2.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("Ark address already taken"));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_update_ark_address_taken() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user1 = TestUser::new();
    let user2 = TestUser::new_with_key(&[0x01; 32]);
    let ark_address1 = Some("tark1user1unique1234567890abcdefghijklmnopqrstuvwxyza".to_string());
    let ark_address2 = Some("tark1user2unique1234567890abcdefghijklmnopqrstuvwxyza".to_string());

    // Register user1 with ark_address1
    let k1_1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_1 = user1.auth_payload(&k1_1);
    app.clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_1.key.clone())
                .header("x-auth-sig", auth_payload_1.sig.clone())
                .header("x-auth-k1", auth_payload_1.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "user1@localhost",
                        "ark_address": ark_address1,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Register user2 with ark_address2
    let k1_2 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_2 = user2.auth_payload(&k1_2);
    app.clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_2.key.clone())
                .header("x-auth-sig", auth_payload_2.sig.clone())
                .header("x-auth-k1", auth_payload_2.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "user2@localhost",
                        "ark_address": ark_address2,
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Try to update user1's ark_address to ark_address2 (which is taken)
    let k1_3 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_3 = user1.auth_payload(&k1_3); // Use user1's auth
    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register") // Still using /register for update
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_3.key.clone())
                .header("x-auth-sig", auth_payload_3.sig.clone())
                .header("x-auth-k1", auth_payload_3.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "user1@localhost", // Can be same or different
                        "ark_address": ark_address2, // This is the taken address
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("Ark address already taken"));

    // Verify user1's ark_address is still ark_address1
    let user_repo = UserRepository::new(&app_state.db_pool);
    let current_user1 = user_repo
        .find_by_pubkey(&user1.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(current_user1.ark_address, ark_address1);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_report_last_login() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(
        &mut tx,
        &user.pubkey().to_string(),
        "testuser@localhost",
        None,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    // Verify last_login_at is initially NULL
    let user_repo = UserRepository::new(&app_state.db_pool);
    let initial_last_login = user_repo
        .get_last_login_at(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(initial_last_login.is_none());

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/report_last_login")
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

    // Verify last_login_at is now set
    let updated_last_login = user_repo
        .get_last_login_at(&user.pubkey().to_string())
        .await
        .unwrap();
    assert!(updated_last_login.is_some());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_report_last_login_updates_timestamp() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    let mut tx = app_state.db_pool.begin().await.unwrap();
    UserRepository::create(
        &mut tx,
        &user.pubkey().to_string(),
        "testuser2@localhost",
        None,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();

    // First login
    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/report_last_login")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let user_repo = UserRepository::new(&app_state.db_pool);
    let first_login = user_repo
        .get_last_login_at(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();

    // Small delay to ensure timestamp difference
    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

    // Second login
    let k1_2 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload_2 = user.auth_payload(&k1_2);

    let response2 = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/report_last_login")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload_2.key)
                .header("x-auth-sig", auth_payload_2.sig)
                .header("x-auth-k1", auth_payload_2.k1)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response2.status(), StatusCode::OK);

    let second_login = user_repo
        .get_last_login_at(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();

    assert!(second_login > first_login);
}
