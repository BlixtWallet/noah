use crate::routes::public_api_v0::{GetK1, LnurlpDefaultResponse};
use crate::tests::common::setup_public_test_app;
use crate::types::{
    AppVersionCheckPayload, AppVersionInfo, LightningAddressSuggestionsPayload,
    LightningAddressSuggestionsResponse,
};
use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_lnurlp_request_default() {
    let (app, app_state, _guard) = setup_public_test_app().await;

    sqlx::query("INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, NULL)")
        .bind("test_pubkey")
        .bind("test@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::GET)
                .uri("/.well-known/lnurlp/test")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LnurlpDefaultResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.tag, "payRequest");
    assert_eq!(res.callback, "https://localhost/.well-known/lnurlp/test");
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_k1() {
    let (app, app_state, _guard) = setup_public_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::GET)
                .uri("/getk1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: GetK1 = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.tag, "login");
    assert!(
        app_state
            .k1_cache
            .contains(&res.k1)
            .await
            .expect("failed to verify k1 in Redis")
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_prefix() {
    let (app, app_state, _guard) = setup_public_test_app().await;

    sqlx::query(
        "INSERT INTO users (pubkey, lightning_address, ark_address) VALUES
            ('pk1', 'alice@localhost', NULL),
            ('pk2', 'alicia@localhost', NULL),
            ('pk3', 'bob@localhost', NULL)",
    )
    .execute(&app_state.db_pool)
    .await
    .unwrap();

    let payload = LightningAddressSuggestionsPayload {
        query: "ali".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LightningAddressSuggestionsResponse = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        res.suggestions,
        vec![
            "alice@localhost".to_string(),
            "alicia@localhost".to_string()
        ]
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_short_query_returns_empty() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = LightningAddressSuggestionsPayload {
        query: "a".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LightningAddressSuggestionsResponse = serde_json::from_slice(&body).unwrap();
    assert!(res.suggestions.is_empty());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_domain_divergence_returns_empty() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = LightningAddressSuggestionsPayload {
        query: "alice@gmail".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LightningAddressSuggestionsResponse = serde_json::from_slice(&body).unwrap();
    assert!(res.suggestions.is_empty());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_limit() {
    let (app, app_state, _guard) = setup_public_test_app().await;

    for i in 0..12 {
        let pubkey = format!("pk{}", i);
        let address = format!("alice{}@localhost", i);
        sqlx::query(
            "INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, NULL)",
        )
        .bind(pubkey)
        .bind(address)
        .execute(&app_state.db_pool)
        .await
        .unwrap();
    }

    let payload = LightningAddressSuggestionsPayload {
        query: "alice".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LightningAddressSuggestionsResponse = serde_json::from_slice(&body).unwrap();
    assert_eq!(res.suggestions.len(), 8);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_query_too_long() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = json!({
        "query": "a".repeat(200)
    });

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_app_version_check_update_required() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = AppVersionCheckPayload {
        client_version: "0.0.0".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/app_version")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: AppVersionInfo = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.minimum_required_version, "0.0.1");
    assert!(res.update_required);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_app_version_check_no_update_required() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = AppVersionCheckPayload {
        client_version: "0.0.1".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/app_version")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: AppVersionInfo = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.minimum_required_version, "0.0.1");
    assert!(!res.update_required);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_app_version_check_newer_version() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = AppVersionCheckPayload {
        client_version: "1.0.0".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/app_version")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: AppVersionInfo = serde_json::from_slice(&body).unwrap();

    assert_eq!(res.minimum_required_version, "0.0.1");
    assert!(!res.update_required);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_app_version_check_invalid_version() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = AppVersionCheckPayload {
        client_version: "invalid".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/app_version")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_ln_address_suggestions_blocked_prefix_returns_empty() {
    let (app, _app_state, _guard) = setup_public_test_app().await;

    let payload = LightningAddressSuggestionsPayload {
        query: "bc1qexample".to_string(),
    };

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/ln_address_suggestions")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res: LightningAddressSuggestionsResponse = serde_json::from_slice(&body).unwrap();
    assert!(res.suggestions.is_empty());
}
