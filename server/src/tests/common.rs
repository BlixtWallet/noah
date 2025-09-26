use std::sync::Arc;

use axum::Router;
use axum::{middleware, routing::post};
use bitcoin::key::Keypair;
use dashmap::DashMap;

use crate::app_middleware::{auth_middleware, user_exists_middleware};
use crate::routes::gated_api_v0::{
    complete_upload, delete_backup, deregister, get_download_url, get_upload_url, get_user_info,
    heartbeat_response, list_backups, register_offboarding_request, register_push_token,
    report_job_status, update_backup_settings, update_ln_address,
};
use crate::routes::public_api_v0::{get_k1, lnurlp_request, register};
use crate::types::AuthPayload;
use crate::{AppState, AppStruct};

pub struct TestUser {
    keypair: Keypair,
    secp: bitcoin::secp256k1::Secp256k1<bitcoin::secp256k1::All>,
}

impl TestUser {
    pub fn new() -> Self {
        let secp = bitcoin::secp256k1::Secp256k1::new();
        let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&[0xcd; 32]).unwrap();
        let keypair = Keypair::from_secret_key(&secp, &secret_key);
        Self { keypair, secp }
    }

    pub fn new_with_key(key_bytes: &[u8; 32]) -> Self {
        let secp = bitcoin::secp256k1::Secp256k1::new();
        let secret_key = bitcoin::secp256k1::SecretKey::from_slice(key_bytes).unwrap();
        let keypair = Keypair::from_secret_key(&secp, &secret_key);
        Self { keypair, secp }
    }

    pub fn pubkey(&self) -> bitcoin::key::PublicKey {
        self.keypair.public_key().into()
    }

    pub fn auth_payload(&self, k1: &str) -> AuthPayload {
        let hash = bitcoin::sign_message::signed_msg_hash(k1);
        let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
        let sig = self.secp.sign_ecdsa(&msg, &self.keypair.secret_key());
        AuthPayload {
            key: self.pubkey().to_string(),
            sig: sig.to_string(),
            k1: k1.to_string(),
        }
    }
}

pub async fn setup_test_app() -> (Router, AppState) {
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
    crate::db::migrations::migrate(&conn).await.unwrap();

    let app_state = Arc::new(AppStruct {
        lnurl_domain: "localhost".to_string(),
        db: Arc::new(db),
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
        expo_access_token: "test-expo-access-token".to_string(),
    });

    // Middleware layers
    let auth_layer = middleware::from_fn_with_state(app_state.clone(), auth_middleware);
    let user_exists_layer =
        middleware::from_fn_with_state(app_state.clone(), user_exists_middleware);

    // Gated routes that need auth AND user to exist in database
    let gated_router = Router::new()
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
        .route("/heartbeat_response", post(heartbeat_response))
        .layer(user_exists_layer);

    // Routes that need auth but user may not exist (like registration)
    let auth_router = Router::new()
        .route("/register", post(register))
        .merge(gated_router)
        .layer(auth_layer);

    let app = auth_router.with_state(app_state.clone());

    (app, app_state)
}

pub async fn setup_public_test_app() -> (Router, AppState) {
    let db_path = format!("/tmp/test-{}.db", rand::random::<u64>());
    let db = libsql::Builder::new_local(db_path).build().await.unwrap();
    let conn = db.connect().unwrap();
    crate::db::migrations::migrate(&conn).await.unwrap();

    let app_state = Arc::new(AppStruct {
        lnurl_domain: "localhost".to_string(),
        db: Arc::new(db),
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
        expo_access_token: "test-expo-access-token".to_string(),
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

// Helper function to create a test user in the database
pub async fn create_test_user(app_state: &AppState, user: &TestUser) {
    let conn = app_state.db.connect().unwrap();
    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![user.pubkey().to_string(), "test@localhost"],
    )
    .await
    .unwrap();
}
