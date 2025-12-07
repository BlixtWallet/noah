# Stage 1: Build the hold plugin using CLN base to match glibc
FROM docker.io/elementsproject/lightningd:v25.09.1 AS builder

ENV RUSTUP_TOOLCHAIN_VERSION=1.89 \
    PATH=/root/.cargo/bin:${PATH}

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    git \
    curl \
    protobuf-compiler \
    ca-certificates \
    libsqlite3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none
RUN rustup toolchain install ${RUSTUP_TOOLCHAIN_VERSION}

RUN git clone https://github.com/BoltzExchange/hold.git && \
    cd hold && \
    git checkout 1e5dec4b479397d77c813060dd01263d689469bc && \
    cargo build && \
    chmod a+x /hold/target/debug/hold

# Stage 2: Clean CLN image with only the plugin binary
FROM docker.io/elementsproject/lightningd:v25.09.1

ENV NETWORK=regtest \
    BITCOIN_RPCCONNECT=bitcoind:18443 \
    BITCOIN_RPCUSER=second \
    BITCOIN_RPCPASSWORD=ark

RUN apt-get update && apt-get install -y --no-install-recommends \
    dos2unix \
    libpq5 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/hold-libs

COPY --from=builder /hold/target/debug/hold /plugins/hold-bin
COPY --from=builder /usr/lib/aarch64-linux-gnu/libsqlite3.so.0* /opt/hold-libs/

# Create wrapper script that sets LD_LIBRARY_PATH only for hold plugin
RUN echo '#!/bin/sh' > /plugins/hold && \
    echo 'exec env LD_LIBRARY_PATH=/opt/hold-libs /plugins/hold-bin "$@"' >> /plugins/hold && \
    chmod a+x /plugins/hold && \
    chmod a+x /plugins/hold-bin

RUN mkdir -p /root/cln/
ADD ./scripts/cln_start.sh /root/cln/start.sh

RUN chmod a+x /root/cln/start.sh && \
    dos2unix /root/cln/start.sh

EXPOSE 9988
