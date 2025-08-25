# AGENTS.md

## Project overview

- This a mobile wallet called Noah.
- The wallet is built for making payments on the Ark network.
- Ark is a layer-2 scaling solution on top of the Bitcoin blockchain.
- This project contains the client code for the mobile wallet and the server code for the backend.

## Project structure

- `/client`: React Native code for the mobile wallet.
- `/client/nitromodules`: Nitro-modules for writing any native code.
- `/server`: Rust code for the backend.
- The project is built in a monorepo style.
- You can run `cargo` and `bun` commands from the root of the project.

## Tech stack Client

- React native with expo
- Runtime: Bun
- Styling: Nativewind
- State management: Zustand
- Routing: React navigation
- Datafetching: Tanstack query
- Error handling: Neverthrow
- Native modules: Nitro-modules

## Tech stack Server

- Rust
- Http server: Axum
- Logging: Tracing
- Database: Libsql
- Runtime: Tokio
- Background jobs: Tokio cron scheduler

## Handling project dependencies

- We use `Nix` to handle dependencies.
- There is a `flake.nix` file in the root of the project.

## Setup commands

- Install deps: `bun install`
- Start Android: `bun android:regtest:debug`
- Start server: `cargo run`
- Build server: `cargo build`
- Test server: `cargo test`

## Code style Client

- TypeScript strict mode
- Avoid `any` type.
- Always use `neverthrow` for error handling.
- Avoid use of `try` and `catch` blocks and use `neverthrow` instead.
- Whenever a component needs to call a method of `react-native-nitro-ark` library, use our hooks in the hooks directory that wrap the API methods.

## Code style Server

- Always use `anyhow` for error handling.
- Try and keep the types as simple as possible.
- Use `tracing` for logging.

## Security considerations

- We separate out the server http logic into multiple files clearly marked as `gated_`, `public_` and `private_`.
- The `gated_` endpoints are accessible only by authenticated users.
- The `public_` endpoints are accessible by anyone.
- The `private_` endpoints are accessible only by the server.
- We use cryptography for authentication and authorization. The middleware checks for signature if it a message is signed by a known public key of the client.
