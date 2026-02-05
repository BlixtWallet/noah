use axum::body::Body;
use axum::http::{self, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

use crate::tests::common::{TestUser, create_test_user, setup_test_app};
use crate::utils::make_k1;

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_invalid_auth() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.sig = "invalid_signature".to_string();

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/list",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from(
                        serde_json::to_vec(&json!({
                            "backup_version": 1,
                            "backup_size": 1024,
                            "backup_enabled": true
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "Endpoint {} should return UNAUTHORIZED for invalid auth",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_error_payload_shape_invalid_auth() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let mut auth_payload = user.auth_payload(&k1);
    auth_payload.sig = "invalid_signature".to_string();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/list")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json_body: serde_json::Value =
        serde_json::from_slice(&body_bytes).expect("failed to parse error response");

    assert_eq!(
        json_body.get("status").and_then(|v| v.as_str()),
        Some("ERROR")
    );
    let code = json_body
        .get("code")
        .and_then(|v| v.as_str())
        .expect("missing error code");
    let message = json_body
        .get("message")
        .and_then(|v| v.as_str())
        .expect("missing error message");
    let reason = json_body
        .get("reason")
        .and_then(|v| v.as_str())
        .expect("missing error reason");

    assert_eq!(code, "INVALID_SIGNATURE");
    assert!(!message.is_empty());
    assert!(!reason.is_empty());
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_missing_k1() {
    let (app, _, _guard) = setup_test_app().await;
    let user = TestUser::new();

    let k1 = "k1_not_in_state".to_string();
    let auth_payload = user.auth_payload(&k1);

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/list",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from(
                        serde_json::to_vec(&json!({
                            "backup_version": 1,
                            "backup_size": 1024,
                            "backup_enabled": true
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Endpoint {} should return BAD_REQUEST for missing k1",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_backup_endpoints_malformed_json() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;
    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    let endpoints = vec![
        "/backup/upload_url",
        "/backup/complete_upload",
        "/backup/download_url",
        "/backup/delete",
        "/backup/settings",
    ];

    for endpoint in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(http::Method::POST)
                    .uri(endpoint)
                    .header(http::header::CONTENT_TYPE, "application/json")
                    .header("x-auth-key", auth_payload.key.clone())
                    .header("x-auth-sig", auth_payload.sig.clone())
                    .header("x-auth-k1", auth_payload.k1.clone())
                    .body(Body::from("invalid json"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Endpoint {} should return BAD_REQUEST for malformed JSON",
            endpoint
        );
    }
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_complete_upload_missing_fields() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Test missing s3_key
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/complete_upload")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "backup_version": 1,
                        "backup_size": 1024
                        // Missing s3_key
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // The server returns UNPROCESSABLE_ENTITY (422) when JSON deserialization fails
    // due to missing required fields
    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_get_upload_url_missing_fields() {
    let (app, app_state, _guard) = setup_test_app().await;
    let user = TestUser::new();
    create_test_user(&app_state, &user, None).await;

    let k1 = make_k1(&app_state.k1_cache)
        .await
        .expect("failed to create k1");
    let auth_payload = user.auth_payload(&k1);

    // Test missing backup_version
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(http::Method::POST)
                .uri("/backup/upload_url")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "backup_size": 1024
                        // Missing backup_version
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_delete_backup_missing_version() {
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
                .uri("/backup/delete")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        // Missing backup_version
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}

#[tracing_test::traced_test]
#[tokio::test]
async fn test_update_backup_settings_missing_enabled() {
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
                .uri("/backup/settings")
                .header(http::header::CONTENT_TYPE, "application/json")
                .header("x-auth-key", auth_payload.key.clone())
                .header("x-auth-sig", auth_payload.sig.clone())
                .header("x-auth-k1", auth_payload.k1.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        // Missing backup_enabled
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Expected BAD_REQUEST (400) or UNPROCESSABLE_ENTITY (422), got {}",
        response.status()
    );
}
