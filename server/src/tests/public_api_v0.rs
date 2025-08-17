use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use dashmap::DashMap;
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::public_api_v0::{GetK1, LnurlpDefaultResponse, get_k1, lnurlp_request};
use crate::{AppState, AppStruct};

async fn setup_test_app() -> (Router, AppState) {
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
        .route("/getk1", axum::routing::get(get_k1))
        .route(
            "/.well-known/lnurlp/{username}",
            axum::routing::get(lnurlp_request),
        )
        .with_state(app_state.clone());

    (app, app_state)
}

#[tokio::test]
async fn test_lnurlp_request_default() {
    let (app, app_state) = setup_test_app().await;

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

#[tokio::test]
async fn test_get_k1() {
    let (app, app_state) = setup_test_app().await;

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
