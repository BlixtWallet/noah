use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::public_api_v0::{GetK1, LnurlpDefaultResponse};
use crate::tests::common::setup_public_test_app;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_lnurlp_request_default() {
    let (app, app_state) = setup_public_test_app().await;

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params!["test_pubkey", "test@localhost"],
    )
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
    let (app, app_state) = setup_public_test_app().await;

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
    assert!(app_state.k1_values.contains_key(&res.k1));
}
