# Noah's Ark 🚢

Noah is a modern, self-custodial mobile wallet for Ark, a Bitcoin Layer 2 protocol. It is built with React Native and Expo.

---

## Table of Contents

- [✨ Core Technologies](#-core-technologies)
- [🚀 Getting Started](#-getting-started)
  - [Using Nix (Recommended)](#using-nix-recommended)
  - [Bare Expo Setup](#bare-expo-setup)
- [⚡️ Local Ark Regtest Environment](#️-local-ark-regtest-environment)
- [🏃 Running the Application](#-running-the-application)
- [📦 Building for Production](#-building-for-production)
- [📜 License](#-license)

---

## ✨ Core Technologies

- **Framework**: React Native & Expo
- **Runtime & Package Manager**: Bun
- **Language**: TypeScript
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State Management**: Zustand
- **Navigation**: React Navigation
- **Data Fetching**: TanStack Query
- **Local Storage**: MMKV
- **Native Modules**: Nitro (Ark)
- **Development Environment**: Nix
- **Server**: Rust

---

## 🚀 Getting Started with the app

You can set up the development environment using Nix (recommended) or by manually installing the dependencies.

### Using Nix (Recommended)

This project uses [Nix](https://nixos.org/) to provide a reproducible development environment. While most dependencies are managed by Nix, you will still need to install a few tools manually.

**Prerequisites:**

1.  **Install Nix**: Follow the [official installation guide](https://docs.determinate.systems/).
2.  **Install direnv**: This tool will automatically load the Nix environment when you enter the project directory. Follow the [direnv installation guide](https://direnv.net/docs/installation.html).
3.  **Hook direnv into your shell**: Make sure to follow the instructions to hook direnv into your shell (e.g., add `eval "$(direnv hook zsh)"` to your `.zshrc`).
4.  **Install IDEs and SDKs**:
    - **Android**: Install [Android Studio](https://developer.android.com/studio).
    - **iOS (macOS only)**: Install [Xcode](https://developer.apple.com/xcode/) from the Mac App Store.

**Setup:**

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/BlixtWallet/noah.git
    cd noah
    ```

2.  **Allow direnv to load the environment**
    This command will trigger Nix to build the development shell. It might take a while on the first run.

    ```bash
    direnv allow
    ```

3.  **Install JavaScript Dependencies**
    Once the Nix shell is active, you can install the project's dependencies.

    ```bash
    just install
    ```

4.  **Install iOS Dependencies (for macOS users)**
    This step links the native iOS libraries.
    ```bash
    just ios-prebuild
    ```

Now the project is ready to run.

### Bare Expo Setup

If you prefer not to use Nix, you can set up your environment manually. This project is a bare Expo project.

For a comprehensive guide on setting up your machine for bare Expo development, please refer to the **[Expo documentation](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&platform=android&device=simulated)**. This includes installing Node.js, Watchman, the Java Development Kit, Android Studio, and Xcode.

Once your environment is set up, follow these steps:

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/BlixtWallet/noah.git
    cd noah
    ```

2.  **Install JavaScript Dependencies**

    ```bash
    just install
    ```

3.  **Install iOS Dependencies (for macOS users)**
    ```bash
    just ios-prebuild
    ```

---

## ⚡️ Local Ark Regtest Environment

For development and testing, you can run a complete local Ark stack using Docker Compose. The environment includes:

- **bitcoind** - Bitcoin Core in regtest mode
- **captaind** (aspd) - Ark Server Protocol Daemon
- **bark** - Ark CLI client
- **postgres** - Database for captaind
- **cln** - Core Lightning node
- **lnd** - Lightning Network Daemon
- **noah-server** - Noah backend server

The [`scripts/ark-dev.sh`](./scripts/ark-dev.sh) script helps manage this environment.

**Prerequisites:**

- **Docker**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
- **jq**: Command-line JSON processor. Install via your package manager (e.g., `brew install jq` on macOS).

**Quick Start - Complete Setup:**

Run the automated setup script that will start all services, create wallets, mine blocks, fund the Ark server, and set up Lightning channels:

```bash
just setup-everything
```

This single command will:
- Start all Docker services (bitcoind, captaind, postgres, cln, lnd, bark, noah-server)
- Create and fund a Bitcoin Core wallet
- Generate 150 blocks
- Fund the Ark server with 1 BTC
- Create a bark wallet
- Fund LND with 0.1 BTC
- Open a Lightning channel between LND and CLN (1M sats, 900k pushed to CLN)

**Manual Setup (Step by Step):**

1.  **Start all services**

    ```bash
    just up
    ```

2.  **Create and fund wallets**
    ```bash
    # Create a Bitcoin Core wallet
    ./scripts/ark-dev.sh create-wallet
    
    # Generate blocks to fund it
    ./scripts/ark-dev.sh generate 150
    
    # Fund the Ark server
    ./scripts/ark-dev.sh fund-aspd 1
    
    # Create a bark wallet
    ./scripts/ark-dev.sh create-bark-wallet
    ```

3.  **Setup Lightning channels (optional)**
    ```bash
    ./scripts/ark-dev.sh setup-lightning-channels
    ```

**Managing Services:**

```bash
# Stop services (keeps data)
just stop

# Stop and delete all data
just down
```

**Useful Commands:**

- Interact with bark wallet: `./scripts/ark-dev.sh bark <command>`
- Interact with ASPD RPC: `./scripts/ark-dev.sh aspd <command>`
- Use bitcoin-cli: `./scripts/ark-dev.sh bcli <command>`
- Use lncli: `./scripts/ark-dev.sh lncli <command>`
- Use lightning-cli (CLN): `./scripts/ark-dev.sh cln <command>`
- Generate blocks: `./scripts/ark-dev.sh generate <num_blocks>`
- Send to address: `./scripts/ark-dev.sh send-to <address> <amount>`

**Service Endpoints:**

- Bitcoin Core RPC: `http://localhost:18443`
- Ark Server (captaind): `http://localhost:3535`
- Noah Server: `http://localhost:3000`
- Noah Server Health: `http://localhost:3099/health`
- PostgreSQL: `localhost:5432`
- LND RPC: `localhost:10009` (P2P: `localhost:9735`)
- CLN RPC: `localhost:9988` (P2P: `localhost:9736`)

For more commands and details, run `./scripts/ark-dev.sh` without arguments.

---

## 🏃 Running the Application

This project uses [just](https://github.com/casey/just) commands to run the application in different environments (Mainnet, Signet, Regtest).

For a full list of available commands, run:

```bash
just
```

**Example (running on Android Regtest):**

```bash
just android
# or
just android-regtest
```

**Example (running on iOS Regtest):**

```bash
just ios
# or
just ios-regtest
```

**Other useful commands:**

```bash
just check              # Run type checking and linting
just ios-prebuild       # Install iOS dependencies
just clean-all          # Clean all build artifacts
just server             # Run server with hot reload (bacon)
just test               # Run server tests
```

## 📡 Running the server

**Important note:** Server uses local sqlite database for `regtest` and `Turso cloud` database for `mainnet` and `signet`.

### Configuration Setup

The server uses a TOML configuration file instead of environment variables.

1. **Copy the example configuration file:**
   ```bash
   cd server
   cp config.toml.example config.toml
   ```

2. **Edit `config.toml` with your values:**
   ```toml
   host = "0.0.0.0"
   port = 3000
   private_port = 3099
   lnurl_domain = "localhost"
   turso_url = "file:noah-regtest.db"  # For regtest
   turso_api_key = "dummy"              # For regtest
   expo_access_token = "your-expo-access-token"
   ark_server_url = "http://localhost:8080"
   server_network = "regtest"
   backup_cron = "every 2 hours"
   s3_bucket_name = "noah-regtest-backups"
   
   # Optional: AWS credentials for S3 (if not using environment variables)
   # aws_access_key_id = "your-aws-access-key-id"
   # aws_secret_access_key = "your-aws-secret-access-key"
   ```

3. **Specify config path (optional):**
   - By default, the server looks for `config.toml` in the current directory
   - Use `--config-path` CLI argument: `cargo run -- --config-path /path/to/config.toml`
   - Or set `CONFIG_PATH` environment variable: `CONFIG_PATH=/path/to/config.toml cargo run`

### Running

- If you're using Nix, simply run `bacon` to start a hot reloading Rust.
- If you are not using Nix, then `cargo install bacon` for hot reloading and then run `bacon`.
- If you just want to run the server `cargo run` or `cargo run --release`.
- For release builds, run `cargo build --release`.

---

## 📦 Building for Production

You can create production-ready application binaries using just commands:

**Android Production Builds:**

```bash
just android-regtest-release
just android-signet-release
just android-mainnet-release
```

**iOS Production Builds:**

```bash
just ios-regtest-release
just ios-signet-release
just ios-mainnet-release
```

For a complete list of build commands, run `just` to see all available recipes.

**Note on Code Signing:** For production builds, you will need to configure your own signing keys. Refer to the official React Native and Expo documentation for code signing on [Android](https://reactnative.dev/docs/signed-apk-android) and iOS.

---

## 📜 License

This project is licensed under the MIT License.
