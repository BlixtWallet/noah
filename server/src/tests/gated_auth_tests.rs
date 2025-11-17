use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::tests::common::{TestUser, setup_test_app};
use crate::types::RegisterResponse;
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_register_new_user() {
    let (app, app_state, _guard) = setup_test_app().await;

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
    let (app, app_state, _guard) = setup_test_app().await;

    let k1 = make_k1(app_state.k1_values.clone());

    let user = TestUser::new();
    let auth_payload = user.auth_payload(&k1);

    sqlx::query("INSERT INTO users (pubkey, lightning_address) VALUES ($1, $2)")
        .bind(user.pubkey().to_string())
        .bind("existing@localhost")
        .execute(&app_state.db_pool)
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
    let (app, app_state, _guard) = setup_test_app().await;

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
    let (app, app_state, _guard) = setup_test_app().await;

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
async fn test_register_expired_k1() {
    let (app, app_state, _guard) = setup_test_app().await;

    let k1_hex = "5a9b8f7c6d5e4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e8d7c6b5a4d3c2b1a0f9e";
    let old_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - 700; // 700 seconds ago, more than 10 minutes
    let k1 = format!("{}_{}", k1_hex, old_timestamp);

    app_state
        .k1_values
        .insert(k1.clone(), std::time::SystemTime::now());

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
async fn test_register_push_token() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    sqlx::query("INSERT INTO users (pubkey, lightning_address) VALUES ($1, $2)")
        .bind(user.pubkey().to_string())
        .bind("existing@localhost")
        .execute(&app_state.db_pool)
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
    use crate::db::push_token_repo::PushTokenRepository;
    let push_token_repo = PushTokenRepository::new(&app_state.db_pool);
    let token = push_token_repo
        .find_by_pubkey(&user.pubkey().to_string())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(token, "test_push_token");
}
