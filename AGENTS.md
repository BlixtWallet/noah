# AGENTS.md

## Purpose

This document is the source of truth for autonomous agents working in the Noah monorepo.
It is intentionally operational: where code lives, how the runtime behaves, and how to make safe changes that pass CI.

## Project summary

- Noah is a mobile Bitcoin wallet for Ark (L2).
- Monorepo contains:
  - `client/`: React Native + Expo mobile app.
  - `server/`: Rust Axum backend.
  - `scripts/`: local regtest/dev stack tooling.
  - `fly/`: Fly.io deployment configs.
  - `docs/`: deep-dive docs for push/widgets/notification coordination.

## Monorepo map

- Root
  - `justfile`: primary dev command surface.
  - `flake.nix`: Nix development environments.
  - `Cargo.toml`: workspace root (member: `server`).
  - `package.json`: Bun workspace root (workspace: `client`).
  - `.github/workflows/`: CI/CD pipelines.
- Client
  - `client/App.tsx`: app root (Sentry wrapping, providers).
  - `client/src/Navigators.tsx`: navigation stacks/tabs + onboarding gate.
  - `client/src/AppServices.tsx`: startup side effects (sync, push, backup, server registration).
  - `client/src/lib/`: APIs, wallet wrappers, backup/sync/tasks/logging.
  - `client/src/hooks/`: feature hooks used by UI.
  - `client/src/store/`: Zustand persisted stores.
  - `client/src/types/serverTypes.ts`: generated from server via `ts-rs`.
  - `client/nitromodules/noah-tools/`: custom Nitro module (native bridge).
- Server
  - `server/src/main.rs`: app bootstrap, dependencies, routers, middleware, cron.
  - `server/src/routes/public_api_v0.rs`: public + semi-public API handlers.
  - `server/src/routes/gated_api_v0.rs`: authenticated/gated handlers.
  - `server/src/routes/app_middleware.rs`: auth/user/email middleware.
  - `server/src/db/`: database repository layer.
  - `server/src/cache/`: Redis-backed stores (k1, invoice, email verification, maintenance).
  - `server/src/types.rs`: shared API payloads and enums exported to TS.
  - `server/src/tests/`: integration-style endpoint/repository tests.
  - `server/migrations/`: SQL migrations.

## Tech stack

### Client

- React Native + Expo (bare-style native projects in `ios/` and `android/`).
- Runtime/package manager: Bun.
- TS strict mode.
- State: Zustand with MMKV persistence.
- Data fetching: TanStack Query.
- Styling: Uniwind/Nativewind + `global.css` theme variables.
- Native wallet + crypto: `react-native-nitro-ark`.
- Custom native bridge: `noah-tools` Nitro module.
- Push: Expo Notifications + UnifiedPush fallback (non-GMS Android).

### Server

- Rust (edition 2024) + Axum.
- DB: Postgres (sqlx).
- Cache/state: Redis/Dragonfly (deadpool-redis).
- Push: Expo push and UnifiedPush endpoint POST.
- Jobs: `tokio-cron-scheduler`.
- Storage/Email: AWS S3 + SES.
- Errors: `anyhow` + typed `ApiError` for HTTP responses.

## Runbook

### Setup

- Install deps: `just install` (or `bun install`).
- Enter Nix shell (recommended): `direnv allow` or `nix develop`.

### Client run commands

- Android regtest debug: `just android` or `just android-regtest`.
- iOS regtest debug: `just ios` or `just ios-regtest`.
- Signet/Mainnet variants: use `just android-signet`, `just ios-signet`, `just android-mainnet`, `just ios-mainnet`.

### Server run commands

- Run server locally with live rebuild loop: `just server` (uses `bacon`).
- Build server: `just server-build`.
- Test server: `just server-test` or `just test`.

### Full local regtest stack

- Bring up infra: `just up`.
- Full bootstrap: `just setup-everything`.
- Tear down: `just down`.
- Helpful wrappers: `just bcli`, `just bark`, `just aspd`, `just lncli`, `just cln`.

### Quality checks

- Client checks: `just check` (runs lint + typecheck under client).
- Server checks: `just server-check` and `cargo fmt --check`.
- Combined: `just check-all`.

## CI reality (must match locally)

- Client PR CI (`.github/workflows/client.yml`):
  - `bun client lint`
  - `bun client typecheck`
  - Android signet build
- Server PR CI (`.github/workflows/server.yml`):
  - `cargo fmt --check`
  - `cargo test` with Postgres + Dragonfly services
  - `cargo build --release --bin noah-cli`
- Husky pre-commit runs:
  - `bun client check`
  - `cargo fmt --check`

## Client architecture details

### App boot sequence

- `client/index.ts` imports `~/lib/pushNotifications` for task registration before root component registration.
- `client/App.tsx` sets providers (QueryClient, SafeArea, GestureHandler, AlertProvider), configures Sentry in non-debug/non-regtest.
- `client/src/Navigators.tsx`:
  - Determines onboarding vs main app based on wallet state.
  - Handles push-permission gate screen.
  - Initializes services via `<AppServices />` after wallet is loaded.

### State model

- `walletStore`:
  - onboarding/wallet-loaded flags, biometrics/debug toggles.
  - background job coordination flags (`isBackgroundJobRunning`, stale cleanup logic).
- `serverStore`:
  - registration status, lightning address, backup enabled, email verified.
- `transactionStore`:
  - auto-boarding preferences.
- `backupStore`:
  - backup status and freshness metadata.

### Networking and auth

- Client server API wrappers live in `client/src/lib/api.ts`.
- Every authenticated request:
  - fetches/uses `k1` (`GET /v0/getk1`),
  - derives key + signs k1 via wallet mnemonic,
  - sends `x-auth-k1`, `x-auth-sig`, `x-auth-key` headers.
- API layer uses `nativePost/nativeGet` from `noah-tools` instead of raw fetch.

### Wallet and payments

- Do not call `react-native-nitro-ark` directly from screens/components.
- Use wrappers/hooks in:
  - `client/src/lib/walletApi.ts`
  - `client/src/lib/paymentsApi.ts`
  - `client/src/hooks/useWallet.ts`
  - `client/src/hooks/usePayments.ts`
- Background sync entrypoint: `client/src/lib/sync.ts`.

### Backup

- Main logic: `client/src/lib/backupService.ts`.
- Automatic trigger logic: `client/src/lib/backupAuto.ts` and `client/src/hooks/useAutoBackup.ts`.
- Flow: create encrypted backup natively -> get presigned upload URL -> upload -> finalize metadata.

### Push and background tasks

- `client/src/lib/pushNotifications.ts` defines Expo background task `BACKGROUND-NOTIFICATION-TASK`.
- Task routes by `notification_type` (`maintenance`, `lightning_invoice_request`, `backup_trigger`, `heartbeat`).
- Uses `walletStore` coordination flags to prevent foreground/background wallet race conditions.
- UnifiedPush support via `noah-tools` for Android devices without Google Play Services.

### Local persistence

- MMKV for app state (`client/src/lib/mmkv.ts`).
- SQLite DB at `ARK_DATA_PATH/noah_wallet.sqlite` with migrations in `client/src/lib/migrations.ts`.
- Transaction/onboarding/offboarding data utilities in `client/src/lib/transactionsDb.ts`.

### Build variants

- App variant comes from native (`getAppVariant()` via Nitro module).
- Android flavors in `client/android/app/build.gradle`: `mainnet`, `signet`, `regtest`.
- iOS schemes/xcconfigs in `client/ios/Config/*.xcconfig` and `Noah-*.xcscheme`.

## Server architecture details

### Router/middleware layout

- Main app in `server/src/main.rs` mounts:
  - `/health` and `/` basic routes,
  - `/v0/*` API routes,
  - `/.well-known/lnurlp/{username}` LNURL pay endpoint.
- Middleware order matters:
  - trace middleware (`trace_layer`) for structured events,
  - Sentry layers,
  - auth middleware on protected routers,
  - user-exists middleware,
  - email-verified middleware (currently warn-only, not hard-blocking).
- Rate limiters (`server/src/rate_limit.rs`):
  - public (stricter),
  - suggestions-specific,
  - authenticated.

### Auth model

- Header-based LNURL-auth style challenge:
  - `x-auth-k1`, `x-auth-sig`, `x-auth-key`.
- `k1` is issued in Redis with timestamp suffix and 10 min TTL.
- On successful auth:
  - signature is verified,
  - k1 is removed (single-use),
  - user key is attached to request extensions + Sentry scope.

### Public and gated endpoints

Public handlers (`public_api_v0.rs`) include:

- `GET /v0/getk1`
- `POST /v0/ln_address_suggestions`
- `POST /v0/app_version`
- `GET /.well-known/lnurlp/{username}`
- `POST /v0/register` (auth headers required)
- `POST /v0/email/send_verification` (auth + user exists)
- `POST /v0/email/verify` (auth + user exists)

Gated handlers (`gated_api_v0.rs`) include:

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

### DB layer

- All SQL belongs in repository modules under `server/src/db/`.
- Key repositories:
  - `user_repo`
  - `push_token_repo`
  - `backup_repo`
  - `heartbeat_repo`
  - `job_status_repo`
  - `notification_tracking_repo`
  - `device_repo`
- Migrations in `server/migrations/` are canonical for schema evolution.

### Cache layer

- `k1_store`: login challenge issuance/verification state.
- `invoice_store`: short-lived invoice handoff during LNURL payment flow.
- `email_verification_store`: code + email with 10-minute TTL.
- `maintenance_store`: round timestamp/counter for maintenance scheduling.

### Background jobs and Ark stream

- Cron scheduler (`server/src/cron.rs`) manages:
  - backup trigger notifications,
  - heartbeat notifications,
  - inactive user deregistration,
  - stale pending job-status timeout sweeps,
  - Redis keepalive ping.
- Ark server stream integration (`server/src/ark_client.rs`) detects rounds and triggers maintenance notifications.

### Push notification dispatch

- `server/src/push.rs`:
  - detects Expo vs UnifiedPush token formats,
  - sends Expo batches,
  - sends UnifiedPush HTTP POST payloads,
  - supports per-device unique k1 generation for job-correlated notifications.
- `server/src/notification_coordinator.rs` applies spacing and priority rules.

## Shared types and contract generation

- Source of truth for shared API types: `server/src/types.rs`.
- Export target: `client/src/types/serverTypes.ts` (generated by `ts-rs`).
- If server types changed, run server tests/build flow that regenerates TS output, then verify client compiles.
- Do not hand-edit `client/src/types/serverTypes.ts`.

## Required coding standards

### Client

- Keep TypeScript strict.
- Avoid `any`.
- Prefer `neverthrow` `Result` flows for recoverable errors.
- Use project logger from `~/lib/log`.
- Do not add `console.*` (lint blocks this in app code).
- For wallet/native actions, use existing hooks/wrapper modules.

### Server

- Use `anyhow` for internal error handling.
- Use `ApiError` for HTTP errors.
- Use `tracing` for logs.
- Keep SQL in `server/src/db/*` repositories (including test-only queries via `#[cfg(test)]` where needed).
- Add/maintain endpoint tests for behavior changes.

## Security and safety constraints

- Never log mnemonics, private keys, raw signatures, or presigned URLs.
- Preserve k1 one-time-use + TTL behavior.
- Respect route gating and middleware layering.
- Validate user-provided lightning addresses through existing validation paths.
- Keep background job coordination logic intact when touching push/wallet load flows.

## Agent task playbooks

### Adding/changing a server endpoint

1. Add/modify payload types in `server/src/types.rs` if needed.
2. Implement handler in `server/src/routes/public_api_v0.rs` or `server/src/routes/gated_api_v0.rs`.
3. Add repository methods in `server/src/db/*` for SQL.
4. Wire route in `server/src/main.rs`.
5. Add tests under `server/src/tests/`.
6. Run `cargo test`.
7. Verify `client/src/types/serverTypes.ts` changes are intentional.

### Adding/changing a client feature that calls server

1. Add wrapper in `client/src/lib/api.ts` (typed with `serverTypes.ts`).
2. Add hook in `client/src/hooks/`.
3. Use hook from screen/component.
4. Keep query invalidation correct (`queryClient.invalidateQueries`).
5. Run `bun client check`.

### Touching push/background flows

1. Verify both Expo and UnifiedPush paths.
2. Preserve `walletStore` background job flag semantics.
3. Ensure job completion reports still call `/report_job_status` for maintenance/backup.
4. Validate no duplicate concurrent operations introduced.

## Known gotchas

- No `start.md` existed historically in this repo; bootstrap guidance now lives there.
- `email_verified_middleware` currently logs warning instead of rejecting unverified users.
- Some docs in `docs/` may describe older concepts (e.g., offboarding coordination) that no longer fully match current code.
- Root `README.md` is useful but not fully authoritative for backend internals.
- `client/nitromodules/noah-tools` contains its own `node_modules`; avoid broad searches there unless needed.

## High-value files to read first for most tasks

- `client/src/Navigators.tsx`
- `client/src/AppServices.tsx`
- `client/src/lib/api.ts`
- `client/src/lib/walletApi.ts`
- `client/src/lib/pushNotifications.ts`
- `server/src/main.rs`
- `server/src/routes/public_api_v0.rs`
- `server/src/routes/gated_api_v0.rs`
- `server/src/routes/app_middleware.rs`
- `server/src/types.rs`
- `server/src/tests/common.rs`
