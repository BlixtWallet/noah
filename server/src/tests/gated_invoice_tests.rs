use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::tests::common::{TestUser, setup_test_app};
use crate::types::DefaultSuccessPayload;
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_submit_invoice_stores_in_redis() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    sqlx::query("INSERT INTO users (pubkey, lightning_address) VALUES ($1, $2)")
        .bind(user.pubkey().to_string())
        .bind("test@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let transaction_id = "test-transaction-123";
    let invoice = "lnbc1000n1test_invoice_data";

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/lnurlp/submit_invoice")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "transaction_id": transaction_id,
                        "invoice": invoice
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

    let stored_invoice = app_state
        .invoice_store
        .get(transaction_id)
        .await
        .expect("failed to get invoice from Redis");

    assert_eq!(stored_invoice, Some(invoice.to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_submit_invoice_can_be_retrieved() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    sqlx::query("INSERT INTO users (pubkey, lightning_address) VALUES ($1, $2)")
        .bind(user.pubkey().to_string())
        .bind("test@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let transaction_id = "test-transaction-456";
    let invoice = "lnbc2000n1another_test_invoice";

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/lnurlp/submit_invoice")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "transaction_id": transaction_id,
                        "invoice": invoice
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let retrieved = app_state
        .invoice_store
        .get(transaction_id)
        .await
        .expect("failed to retrieve invoice");
    assert_eq!(retrieved, Some(invoice.to_string()));

    app_state
        .invoice_store
        .remove(transaction_id)
        .await
        .expect("failed to remove invoice");

    let after_removal = app_state
        .invoice_store
        .get(transaction_id)
        .await
        .expect("failed to check invoice after removal");
    assert_eq!(after_removal, None);
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_submit_invoice_requires_auth() {
    let (app, _app_state, _guard) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/lnurlp/submit_invoice")
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "transaction_id": "test-123",
                        "invoice": "lnbc1000n1test"
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
async fn test_submit_invoice_requires_existing_user() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/lnurlp/submit_invoice")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "transaction_id": "test-123",
                        "invoice": "lnbc1000n1test"
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
async fn test_submit_invoice_overwrites_existing() {
    let (app, app_state, _guard) = setup_test_app().await;

    let user = TestUser::new();

    sqlx::query("INSERT INTO users (pubkey, lightning_address) VALUES ($1, $2)")
        .bind(user.pubkey().to_string())
        .bind("test@localhost")
        .execute(&app_state.db_pool)
        .await
        .unwrap();

    let transaction_id = "test-transaction-overwrite";
    let first_invoice = "lnbc1000n1first_invoice";
    let second_invoice = "lnbc2000n1second_invoice";

    app_state
        .invoice_store
        .store(transaction_id, first_invoice)
        .await
        .expect("failed to store first invoice");

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let response = app
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/lnurlp/submit_invoice")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", &auth_payload.key)
                .header("x-auth-sig", &auth_payload.sig)
                .header("x-auth-k1", &auth_payload.k1)
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "transaction_id": transaction_id,
                        "invoice": second_invoice
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let stored = app_state
        .invoice_store
        .get(transaction_id)
        .await
        .expect("failed to get invoice");
    assert_eq!(stored, Some(second_invoice.to_string()));
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_invoice_store_returns_none_for_nonexistent() {
    let (_app, app_state, _guard) = setup_test_app().await;

    let result = app_state
        .invoice_store
        .get("nonexistent-transaction-id")
        .await
        .expect("failed to query invoice store");

    assert_eq!(result, None);
}
