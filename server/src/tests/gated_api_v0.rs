use std::sync::Arc;
use std::time::SystemTime;

use axum::Router;
use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use bitcoin::key::Keypair;
use dashmap::DashMap;
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::app_middleware::{AuthPayload, auth_middleware};
use crate::gated_api_v0::{
    LNUrlAuthResponse, UserInfoResponse, get_user_info, register, register_push_token,
    update_ln_address,
};
use crate::{AppState, AppStruct};
use axum::middleware;

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
        .route("/register", axum::routing::post(register))
        .route(
            "/register_push_token",
            axum::routing::post(register_push_token),
        )
        .route("/user_info", axum::routing::post(get_user_info))
        .route("/update_ln_address", axum::routing::post(update_ln_address))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ))
        .with_state(app_state.clone());

    (app, app_state)
}

#[tokio::test]
async fn test_register_new_user() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let hash = bitcoin::sign_message::signed_msg_hash(k1);
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    let sig = secp.sign_ecdsa(&msg, &keypair.secret_key());

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: sig.to_string(),
        k1: k1.to_string(),
    };

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

#[tokio::test]
async fn test_register_existing_user() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1_existing";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![pubkey.to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let hash = bitcoin::sign_message::signed_msg_hash(k1);
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    let sig = secp.sign_ecdsa(&msg, &keypair.secret_key());

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: sig.to_string(),
        k1: k1.to_string(),
    };

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

#[tokio::test]
async fn test_register_invalid_signature() {
    let (app, app_state) = setup_test_app().await;

    let k1 = "test_k1_invalid_sig";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: "invalid_sig".to_string(),
        k1: k1.to_string(),
    };

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

#[tokio::test]
async fn test_register_invalid_k1() {
    let (app, _) = setup_test_app().await;

    let k1 = "test_k1_invalid";

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: "test_sig".to_string(),
        k1: k1.to_string(),
    };

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

#[tokio::test]
async fn test_register_push_token() {
    let (app, app_state) = setup_test_app().await;

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![pubkey.to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let hash = bitcoin::sign_message::signed_msg_hash(k1);
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    let sig = secp.sign_ecdsa(&msg, &keypair.secret_key());

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: sig.to_string(),
        k1: k1.to_string(),
    };

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
            libsql::params![pubkey.to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let push_token: String = row.get(0).unwrap();
    assert_eq!(push_token, "test_push_token");
}

#[tokio::test]
async fn test_get_user_info() {
    let (app, app_state) = setup_test_app().await;

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![pubkey.to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let hash = bitcoin::sign_message::signed_msg_hash(k1);
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    let sig = secp.sign_ecdsa(&msg, &keypair.secret_key());

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: sig.to_string(),
        k1: k1.to_string(),
    };

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

#[tokio::test]
async fn test_update_ln_address() {
    let (app, app_state) = setup_test_app().await;

    let secp = bitcoin::secp256k1::Secp256k1::new();
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
    let keypair = Keypair::from_secret_key(&secp, &secret_key);
    let pubkey = keypair.public_key();

    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![pubkey.to_string(), "existing@localhost"],
    )
    .await
    .unwrap();

    let k1 = "test_k1";
    app_state
        .k1_values
        .insert(k1.to_string(), SystemTime::now());
    let hash = bitcoin::sign_message::signed_msg_hash(k1);
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    let sig = secp.sign_ecdsa(&msg, &keypair.secret_key());

    let auth_payload = AuthPayload {
        key: pubkey.to_string(),
        sig: sig.to_string(),
        k1: k1.to_string(),
    };

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
            libsql::params![pubkey.to_string()],
        )
        .await
        .unwrap();

    let row = rows.next().await.unwrap().unwrap();
    let ln_address: String = row.get(0).unwrap();
    assert_eq!(ln_address, "new@localhost");
}
