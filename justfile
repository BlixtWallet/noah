# Noah Wallet Justfile

# Default recipe to display available commands
default:
    @just --list

# Run type checking and linting
check:
    bun run check

# Install dependencies
install:
    bun install

# Start Expo dev server
start:
    bun start

# Android builds (regtest)
android:
    bun run android:regtest:debug

android-regtest:
    bun run android:regtest:debug

android-regtest-release:
    bun client build:android:regtest:release

# Android builds (signet)
android-signet:
    bun run android:signet:debug

android-signet-release:
    bun client build:android:signet:release

# Android builds (mainnet)
android-mainnet:
    bun run android:mainnet:debug

android-mainnet-release:
    bun client build:android:mainnet:release

# iOS builds (regtest)
ios:
    bun client ios:regtest:debug

ios-regtest:
    bun client ios:regtest:debug

ios-regtest-release:
    bun client ios:regtest:release

# iOS builds (signet)
ios-signet:
    bun client ios:signet:debug

ios-signet-release:
    bun client ios:signet:release

# iOS builds (mainnet)
ios-mainnet:
    bun client ios:mainnet:debug

ios-mainnet-release:
    bun client ios:mainnet:release

# iOS pod install
ios-prebuild:
    bun run ios:prebuild

# Clean commands
clean-android:
    bun run android:clean

clean-ios:
    bun run ios:clean

clean-all:
    bun client clean:all

# Server commands
server:
    bacon

server-build:
    cargo build

server-test:
    cargo test

server-check:
    cargo check

# Combined checks
check-all: check server-check

# Run tests
test:
    cargo test

# Local regtest environment commands
setup-everything:
    ./scripts/ark-dev.sh setup-everything

up:
    ./scripts/ark-dev.sh up

down:
    ./scripts/ark-dev.sh down

stop:
    ./scripts/ark-dev.sh stop

# Ark dev shortcuts - pass arguments directly
bark *args:
    ./scripts/ark-dev.sh bark {{args}}

aspd *args:
    ./scripts/ark-dev.sh aspd {{args}}

bcli *args:
    ./scripts/ark-dev.sh bcli {{args}}

lncli *args:
    ./scripts/ark-dev.sh lncli {{args}}

cln *args:
    ./scripts/ark-dev.sh cln {{args}}

# Bitcoin commands
create-wallet:
    ./scripts/ark-dev.sh create-wallet

create-bark-wallet:
    ./scripts/ark-dev.sh create-bark-wallet

generate blocks="101":
    ./scripts/ark-dev.sh generate {{blocks}}

fund-aspd amount:
    ./scripts/ark-dev.sh fund-aspd {{amount}}

send-to address amount:
    ./scripts/ark-dev.sh send-to {{address}} {{amount}}

# Lightning commands
setup-lightning:
    ./scripts/ark-dev.sh setup-lightning-channels
