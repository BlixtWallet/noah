use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::types::EmailVerificationResponse;
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_send_verification_email_success() {
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
                .uri("/email/send_verification")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "test@example.com"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: EmailVerificationResponse = serde_json::from_slice(&body).unwrap();

    assert!(res.success);
    assert_eq!(res.message, Some("Verification code sent".to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_send_verification_email_invalid_email() {
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
                .uri("/email/send_verification")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "invalid-email"
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
async fn test_send_verification_email_already_verified() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    // Create user with verified email
    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, email, is_email_verified) VALUES ($1, $2, $3, $4)",
    )
    .bind(user.pubkey().to_string())
    .bind("test@localhost")
    .bind("verified@example.com")
    .bind(true)
    .execute(&app_state.db_pool)
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
                .uri("/email/send_verification")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "another@example.com"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: EmailVerificationResponse = serde_json::from_slice(&body).unwrap();

    assert!(res.success);
    assert_eq!(res.message, Some("Email already verified".to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_send_verification_email_already_in_use() {
    let (app, app_state, _guard) = setup_test_app().await;

    // Create first user with verified email
    let other_user = TestUser::new_with_key(&[0xab; 32]);
    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, email, is_email_verified) VALUES ($1, $2, $3, $4)",
    )
    .bind(other_user.pubkey().to_string())
    .bind("other@localhost")
    .bind("taken@example.com")
    .bind(true)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    // Create second user who will try to use the same email
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
                .uri("/email/send_verification")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "taken@example.com"
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
async fn test_verify_email_success() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Store a verification code directly
    let code = "123456";
    let email = "test@example.com";
    app_state
        .email_verification_store
        .store(&auth_payload.key, email, code)
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/email/verify")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "code": code
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: EmailVerificationResponse = serde_json::from_slice(&body).unwrap();

    assert!(res.success);
    assert_eq!(res.message, Some("Email verified successfully".to_string()));

    // Verify the user's email was updated in the database
    let user_record = sqlx::query_as::<_, (Option<String>, bool)>(
        "SELECT email, is_email_verified FROM users WHERE pubkey = $1",
    )
    .bind(user.pubkey().to_string())
    .fetch_one(&app_state.db_pool)
    .await
    .unwrap();

    assert_eq!(user_record.0, Some(email.to_string()));
    assert!(user_record.1);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_verify_email_invalid_code() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Store a verification code
    app_state
        .email_verification_store
        .store(&auth_payload.key, "test@example.com", "123456")
        .await
        .unwrap();

    // Try to verify with wrong code
    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/email/verify")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "code": "999999"
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
async fn test_verify_email_no_pending_verification() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Try to verify without having requested a code
    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/email/verify")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "code": "123456"
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
async fn test_verify_email_already_verified() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    // Create user with verified email
    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, email, is_email_verified) VALUES ($1, $2, $3, $4)",
    )
    .bind(user.pubkey().to_string())
    .bind("test@localhost")
    .bind("verified@example.com")
    .bind(true)
    .execute(&app_state.db_pool)
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
                .uri("/email/verify")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "code": "123456"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: EmailVerificationResponse = serde_json::from_slice(&body).unwrap();

    assert!(res.success);
    assert_eq!(res.message, Some("Email already verified".to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_verify_email_duplicate_email() {
    let (app, app_state, _guard) = setup_test_app().await;

    // Create first user with verified email
    let other_user = TestUser::new_with_key(&[0xab; 32]);
    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, email, is_email_verified) VALUES ($1, $2, $3, $4)",
    )
    .bind(other_user.pubkey().to_string())
    .bind("other@localhost")
    .bind("taken@example.com")
    .bind(true)
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    // Create second user
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Store verification code for the taken email
    let code = "123456";
    app_state
        .email_verification_store
        .store(&auth_payload.key, "taken@example.com", code)
        .await
        .unwrap();

    // Try to verify - should fail because email is already taken
    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/email/verify")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "code": code
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return BAD_REQUEST because email is already in use
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_returns_email_verified_status() {
    let (app, app_state, _guard) = setup_test_app().await;

    // Create user with verified email
    let user = TestUser::new();
    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, email, is_email_verified) VALUES ($1, $2, $3, $4)",
    )
    .bind(user.pubkey().to_string())
    .bind("test@localhost")
    .bind("verified@example.com")
    .bind(true)
    .execute(&app_state.db_pool)
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
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
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
    let res: crate::types::RegisterResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.status, "OK");
    assert!(res.is_email_verified);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_returns_email_not_verified_for_new_user() {
    let (app, app_state, _guard) = setup_test_app().await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");

    let user = TestUser::new();
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/register")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "ln_address": "newuser@localhost"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: crate::types::RegisterResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.status, "OK");
    assert!(!res.is_email_verified);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_send_verification_unregistered_user() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();
    // Don't create the user in the database

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/email/send_verification")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "test@example.com"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // User not found returns 401 UNAUTHORIZED from the middleware
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
