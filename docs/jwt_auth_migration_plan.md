# JWT Authentication Migration Plan

## Goal

Replace the current per-request `k1` + signature authentication flow with:

- a one-time `k1` challenge for login only
- a server-signed access JWT for all authenticated routes
- a configurable JWT TTL with a default of 24 hours

This is intentionally a breaking auth change. Backwards compatibility is not required.

## Locked Decisions

- [x] Phase 1 uses access JWTs only
- [x] No refresh token in phase 1
- [x] `AUTH_JWT_TTL_HOURS` defaults to `24`
- [x] Keep `GET /v0/getk1` as the login challenge endpoint in phase 1 to reduce churn
- [x] Move all authenticated routes to bearer auth
- [x] Split notification/job correlation from authentication instead of overloading `k1`

## Current Auth Coupling In Code

The main places that need to change are:

- `server/src/routes/app_middleware.rs`
  - current request auth reads `x-auth-k1`, `x-auth-sig`, `x-auth-key`
- `server/src/main.rs`
  - current router wiring applies that middleware to all protected routes
- `server/src/routes/public_api_v0.rs`
  - `get_k1` is the public challenge endpoint
  - `register` currently assumes auth has already been derived from `AuthPayload`
- `server/src/routes/gated_api_v0.rs`
  - all gated handlers currently receive `Extension<AuthPayload>`
- `server/src/types.rs`
  - `AuthPayload` is the current auth context
  - notification payloads currently embed auth-related `k1`
- `server/src/push.rs`
  - unique push `k1` values are currently created for background notifications
- `server/src/notification_coordinator.rs`
  - pending job reports are currently keyed by `notification_k1`
- `server/src/db/job_status_repo.rs`
  - report updates are keyed by `(pubkey, notification_k1)`
- `client/src/lib/api.ts`
  - generic `post()` fetches a `k1`, reads mnemonic, derives pubkey, signs, and sends auth headers on nearly every authenticated request
- `client/src/lib/backupService.ts`
  - restore path has a custom manual auth path for `backup/download_url`
- `client/src/lib/pushNotifications.ts`
  - maintenance/backup completion currently sends `k1` back through `reportJobStatus`
- `client/src/lib/tasks.ts`
  - invoice submission currently sends notification `k1` back for auth optimization

## Target API Shape

### Public Auth Endpoints

- `GET /v0/getk1`
  - unchanged route name
  - used only to obtain a one-time login challenge
- `POST /v0/auth/login`
  - request body:
    - `key`
    - `sig`
    - `k1`
  - response body:
    - `access_token`
    - `token_type` = `Bearer`
    - `expires_at`
    - `expires_in_seconds`

### Authenticated Request Header

- `Authorization: Bearer <access_token>`

### Protected Routes After Cutover

All of the following should use bearer auth:

- `POST /v0/register`
- `POST /v0/email/send_verification`
- `POST /v0/email/verify`
- `POST /v0/register_push_token`
- `POST /v0/lnurlp/submit_invoice`
- `POST /v0/user_info`
- `POST /v0/update_ln_address`
- `POST /v0/deregister`
- `POST /v0/backup/upload_url`
- `POST /v0/backup/complete_upload`
- `POST /v0/backup/list`
- `POST /v0/backup/download_url`
- `POST /v0/backup/delete`
- `POST /v0/backup/settings`
- `POST /v0/report_job_status`
- `POST /v0/heartbeat_response`
- `POST /v0/report_last_login`

### Notification Payload Cleanup

After cutover, notification payloads should no longer carry auth `k1`.

Planned shape:

- `MaintenanceNotification`
  - `notification_k1`
- `BackupTriggerNotification`
  - `notification_k1`
- `HeartbeatNotification`
  - `notification_id`
- `LightningInvoiceRequestNotification`
  - `transaction_id`
  - `amount`

### Background Route Payload Cleanup

- `ReportJobStatusPayload`
  - add `notification_k1`
- `HeartbeatResponsePayload`
  - keep `notification_id`
  - no auth `k1`
- `SubmitInvoicePayload`
  - keep `invoice`
  - keep `transaction_id`
  - no auth `k1`

## Server TODO

### 1. Dependencies And Config

- [ ] Add a JWT library to `server/Cargo.toml`
- [ ] Add `AUTH_JWT_SECRET` to `server/src/config.rs`
- [ ] Add `AUTH_JWT_TTL_HOURS` to `server/src/config.rs`
- [ ] Default `AUTH_JWT_TTL_HOURS` to `24`
- [ ] Fail startup if `AUTH_JWT_SECRET` is missing
- [ ] Update `server/src/tests/common.rs` test config with a fixed JWT secret

### 2. Auth Module

- [ ] Add a dedicated auth module, for example `server/src/auth.rs`
- [ ] Define JWT claims with at least:
  - `sub`
  - `iat`
  - `exp`
- [ ] Implement `mint_access_token(pubkey)`
- [ ] Implement `verify_access_token(token)`
- [ ] Keep the existing `k1` signature verification logic, but treat it as login-challenge verification only
- [ ] Move any generic signature helpers out of request middleware if that makes the flow clearer

### 3. Shared Types

- [ ] Replace `AuthPayload` in `server/src/types.rs` with a request-extension type for JWT-authenticated users, for example `AuthenticatedUser`
- [ ] Add auth request/response DTOs for `POST /v0/auth/login` in `server/src/types.rs`
- [ ] Update `ReportJobStatusPayload` in `server/src/types.rs` to include `notification_k1`
- [ ] Remove auth `k1` from `LightningInvoiceRequestNotification`
- [ ] Remove auth `k1` from `HeartbeatNotification`
- [ ] Rename `k1` to `notification_k1` in `MaintenanceNotification`
- [ ] Rename `k1` to `notification_k1` in `BackupTriggerNotification`
- [ ] Regenerate `client/src/types/serverTypes.ts`

### 4. Errors

- [ ] Add explicit auth/token errors in `server/src/errors.rs`
- [ ] Return stable machine-readable codes for:
  - missing bearer token
  - invalid token
  - expired token
- [ ] Keep login-challenge errors separate from token-validation errors

### 5. Public Auth Routes

- [ ] Keep `get_k1` in `server/src/routes/public_api_v0.rs`
- [ ] Update its documentation/comments to reflect login-only usage
- [ ] Add `POST /v0/auth/login` in `server/src/routes/public_api_v0.rs`
- [ ] In `auth/login`:
  - validate `k1`
  - validate `k1` age
  - verify signature
  - evict `k1`
  - mint JWT
  - return token response
- [ ] Apply rate limiting to `POST /v0/auth/login`

### 6. Bearer Auth Middleware

- [ ] Rewrite `server/src/routes/app_middleware.rs` so standard auth reads `Authorization: Bearer ...`
- [ ] Parse and validate the JWT
- [ ] Insert `AuthenticatedUser` into request extensions
- [ ] Set Sentry user from JWT subject
- [ ] Set `WideEventHandle` user from JWT subject
- [ ] Keep `user_exists_middleware` and `email_verified_middleware`, but update them to read `AuthenticatedUser`

### 7. Router Wiring

- [ ] Rewire `server/src/main.rs` into:
  - public router
  - bearer-auth router
- [ ] Put `POST /v0/auth/login` on the public router
- [ ] Move all currently protected routes to the bearer-auth router
- [ ] Remove the old `x-auth-*` middleware from normal protected routes

### 8. Handler Updates

- [ ] Update all JWT-protected handlers in `server/src/routes/public_api_v0.rs` and `server/src/routes/gated_api_v0.rs` to read `Extension<AuthenticatedUser>`
- [ ] Keep `register` business logic intact, only change how the caller is authenticated
- [ ] Update backup handlers to use JWT-authenticated `pubkey`
- [ ] Update `report_last_login` to use JWT-authenticated `pubkey`

### 9. Background Job/Auth Decoupling

- [ ] Update `report_job_status` in `server/src/routes/gated_api_v0.rs` to read `payload.notification_k1` instead of auth `k1`
- [ ] Update `JobStatusRepository::update_by_k1` callers to use explicit `notification_k1`
- [ ] Leave `JobStatusRepository` keying as `(pubkey, notification_k1)`
- [ ] Remove auth `k1` assumptions from `submit_invoice`
- [ ] Remove auth `k1` assumptions from `heartbeat_response`

### 10. Push Notification Generation

- [ ] Update `server/src/push.rs` so unique notification correlation tokens are generated only for notification types that need job-status correlation
- [ ] Update `NotificationData::needs_unique_k1()` in `server/src/types.rs`
- [ ] Rename that concept in code/comments from auth `k1` to `notification_k1`
- [ ] Update `server/src/notification_coordinator.rs` comments to match the new terminology
- [ ] Remove LNURL invoice-auth optimization `k1` generation from `server/src/routes/public_api_v0.rs`

### 11. Server Tests

- [ ] Update `server/src/tests/common.rs` with helper methods to:
  - request `getk1`
  - sign it
  - call `auth/login`
  - attach bearer auth headers
- [ ] Convert all protected route tests to use bearer auth
- [ ] Add tests for:
  - valid login returns JWT
  - reused `k1` is rejected
  - expired `k1` is rejected
  - invalid signature is rejected
  - expired JWT is rejected
  - missing bearer token is rejected
  - `report_job_status` uses explicit `notification_k1`
- [ ] Update any loadtest helpers that still assume `x-auth-*` on every request

## Client TODO

### 1. Token Storage

- [ ] Add secure storage for the JWT, preferably using Keychain alongside the mnemonic storage path in `client/src/lib/crypto.ts`
- [ ] Do not store the JWT in `client/src/store/serverStore.ts`
- [ ] Add helpers for:
  - get token
  - set token
  - clear token
  - decode/check expiry

### 2. Auth Session Helper

- [ ] Add a dedicated auth/session client module, for example `client/src/lib/authSession.ts`
- [ ] Implement:
  - `loginWithMnemonic()`
  - `loginWithProvidedMnemonic(mnemonic)`
  - `ensureValidAccessToken()`
  - `clearAccessToken()`
- [ ] `loginWithMnemonic()` should:
  - call `GET /v0/getk1`
  - read mnemonic
  - derive public key
  - sign `k1`
  - call `POST /v0/auth/login`
  - persist JWT

### 3. Generic API Wrapper

- [ ] Remove per-request `getK1()` + signing behavior from `client/src/lib/api.ts`
- [ ] Replace it with bearer token injection
- [ ] Before any authenticated request, call `ensureValidAccessToken()`
- [ ] If no valid token exists, perform login via challenge + signature
- [ ] Stop sending `x-auth-k1`, `x-auth-sig`, `x-auth-key` on normal routes

### 4. Route-Specific Client Cleanup

- [ ] Keep `registerWithServer()` behavior the same, but make it rely on a valid JWT existing first
- [ ] Remove `k1` from `submitInvoice()` request types in `client/src/lib/api.ts`
- [ ] Add `notification_k1` to `reportJobStatus()` request types in `client/src/lib/api.ts`
- [ ] Remove `k1` from `heartbeatResponse()` request types in `client/src/lib/api.ts`
- [ ] Remove the custom raw-header `getDownloadUrlForRestore()` path from `client/src/lib/api.ts`

### 5. Restore Flow

- [ ] Update `client/src/lib/backupService.ts` restore flow to:
  - login with the provided mnemonic
  - receive a JWT
  - call `backup/download_url` with bearer auth
- [ ] Delete the current custom restore auth path once the JWT path works

### 6. Background Tasks

- [ ] Update `client/src/lib/pushNotifications.ts` to consume new notification shapes
- [ ] Rename `k1` to `notification_k1` for maintenance/backup task completion
- [ ] Remove auth `k1` handling from heartbeat task
- [ ] Remove auth `k1` handling from invoice submission task
- [ ] Before protected background calls, ensure a valid JWT exists
- [ ] If the JWT is expired during background execution, perform login again using the stored mnemonic

### 7. App Startup

- [ ] Update startup flow in `client/src/AppServices.tsx`
- [ ] Ensure JWT is valid before `reportLastLogin()`
- [ ] Ensure JWT is valid before registration/bootstrap flows
- [ ] Keep `useServerRegistration` behavior mostly intact, but separate auth from registration

## Migration Sequence

- [ ] Land server auth module, login endpoint, bearer middleware, and tests
- [ ] Land server-side notification payload cleanup
- [ ] Regenerate shared TS types
- [ ] Land client token/session storage
- [ ] Land client API wrapper changes
- [ ] Land restore-flow migration
- [ ] Land background-task migration
- [ ] Remove dead `x-auth-*` client code
- [ ] Remove dead server-side assumptions that auth headers carry correlation state

## Acceptance Criteria

- [ ] All protected routes accept bearer auth and no longer require per-request `getk1`
- [ ] `GET /v0/getk1` is used only for login
- [ ] Default JWT TTL is 24 hours and is configurable through env
- [ ] Login challenge reuse is rejected
- [ ] Expired JWTs return `401`
- [ ] `report_job_status` uses explicit `notification_k1`
- [ ] Maintenance and backup push flows still report completion correctly
- [ ] Heartbeat and invoice-request push flows work without auth `k1`
- [ ] Restore flow works using JWT login with the provided mnemonic
- [ ] `cargo test` passes
- [ ] `just server-check` passes
- [ ] `bun client check` passes

## Non-Goals For Phase 1

- [ ] Refresh tokens
- [ ] Server-side session revocation
- [ ] Multi-device session management
- [ ] Backwards compatibility with old auth headers
