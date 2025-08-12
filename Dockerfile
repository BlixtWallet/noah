# Stage 1: Build the application
FROM rust:1.88 AS builder

WORKDIR /app

# Copy the workspace and server Cargo files to plan the build
COPY ./Cargo.toml ./Cargo.toml
COPY ./server/Cargo.toml ./server/Cargo.toml

# Copy the lock file and build the dependencies
COPY ./Cargo.lock ./Cargo.lock

# Copy the application source code and build the application
COPY ./server/src/ ./server/src
RUN cargo build --release --manifest-path ./server/Cargo.toml

# Stage 2: Create the runtime image
FROM debian:bookworm-slim AS runtime

# Install CA certificates for TLS
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /app/target/release/server /usr/local/bin/

EXPOSE 3000

# Set the startup command
CMD ["server"]