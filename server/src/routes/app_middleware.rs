use axum::{
    extract::{Request, State},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::{
    AppState, auth::verify_access_token, db::user_repo::UserRepository, errors::ApiError,
    types::AuthenticatedUser, utils::verify_user_exists, wide_event::WideEventHandle,
};

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, Response> {
    let uri_path = request.uri().path().to_string();

    let authorization = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let token = authorization
        .as_deref()
        .and_then(|header| header.strip_prefix("Bearer "))
        .filter(|token| !token.is_empty())
        .ok_or_else(|| {
            tracing::warn!(uri = %uri_path, "Auth failed: Missing bearer token");
            ApiError::AuthRequired.into_response()
        })?;

    let authenticated_user = verify_access_token(&state.config, token).map_err(|error| {
        tracing::warn!(uri = %uri_path, error = ?error, "Auth failed: Invalid bearer token");
        error.into_response()
    })?;

    if let Some(event) = request.extensions().get::<WideEventHandle>() {
        event.set_user(&authenticated_user.key);
    }

    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry::User {
            id: Some(authenticated_user.key.clone()),
            ..Default::default()
        }));
    });

    tracing::debug!(key = %authenticated_user.key, "Auth successful");
    request.extensions_mut().insert(authenticated_user);
    Ok(next.run(request).await)
}

pub async fn user_exists_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, Response> {
    let authenticated_user = match request.extensions().get::<AuthenticatedUser>() {
        Some(payload) => payload,
        None => {
            return Err(ApiError::ServerErr(
                "Authentication failed. Please try again.".to_string(),
            )
            .into_response());
        }
    };

    let uri_path = request.uri().path().to_string();

    if !verify_user_exists(&state.db_pool, &authenticated_user.key)
        .await
        .map_err(|e| {
            tracing::error!(
                uri = %uri_path,
                key = %authenticated_user.key,
                error = %e,
                "User existence check failed: Error checking user existence"
            );
            ApiError::UserNotFound.into_response()
        })?
    {
        tracing::warn!(
            uri = %uri_path,
            key = %authenticated_user.key,
            "User existence check failed: User not found in database"
        );
        return Err(ApiError::UserNotFound.into_response());
    }

    Ok(next.run(request).await)
}

pub async fn email_verified_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, Response> {
    let authenticated_user = match request.extensions().get::<AuthenticatedUser>() {
        Some(payload) => payload,
        None => {
            return Err(ApiError::ServerErr(
                "Authentication failed. Please try again.".to_string(),
            )
            .into_response());
        }
    };

    let user_repo = UserRepository::new(&state.db_pool);
    let is_verified = user_repo
        .is_email_verified(&authenticated_user.key)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Email verification check failed");
            ApiError::ServerErr("Failed to check email verification status".to_string())
                .into_response()
        })?;

    if let Some(event) = request.extensions().get::<WideEventHandle>() {
        event.set_email_verified(is_verified);
    }

    if !is_verified {
        // TODO: Temporarily just logging instead of blocking - re-enable blocking later
        tracing::warn!(
            path = %request.uri().path(),
            "Email not verified (allowing request temporarily)"
        );
        // return Err(ApiError::InvalidArgument("Email not verified".to_string()).into_response());
    }

    Ok(next.run(request).await)
}
