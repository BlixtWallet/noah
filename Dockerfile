# Stage 1: Install cargo-chef
FROM rust:1.88 AS chef
RUN cargo install cargo-chef
WORKDIR /app

# Stage 2: Analyze dependencies
FROM chef AS planner
COPY ./Cargo.toml ./Cargo.toml
COPY ./server/Cargo.toml ./server/Cargo.toml
COPY ./Cargo.lock ./Cargo.lock
COPY ./server/src/ ./server/src
RUN cargo chef prepare --recipe-path recipe.json

# Stage 3: Build dependencies (cached layer)
FROM chef AS builder
RUN apt-get update && apt-get install -y protobuf-compiler && rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json --manifest-path ./server/Cargo.toml

# Stage 4: Build application
COPY ./Cargo.toml ./Cargo.toml
COPY ./server/Cargo.toml ./server/Cargo.toml
COPY ./Cargo.lock ./Cargo.lock
COPY ./server/src/ ./server/src
RUN cargo build --release --manifest-path ./server/Cargo.toml

# Stage 5: Runtime image
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates curl pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/server /usr/local/bin/
RUN mkdir -p /etc/server

EXPOSE 3000
CMD ["server", "--config-path", "/etc/server/config.toml"]
