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
    Once the Nix shell is active, you can install the project's dependencies using Bun.

    ```bash
    bun install
    ```

4.  **Install iOS Dependencies (for macOS users)**
    This step links the native iOS libraries.
    ```bash
    bun client ios:prebuild
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
    bun install
    ```

3.  **Install iOS Dependencies (for macOS users)**
    ```bash
    bun client ios:prebuild
    ```

---

## ⚡️ Local Ark Regtest Environment

For development and testing, you can run a local Ark stack (bitcoind, aspd, bark) using Docker. The [`scripts/ark-dev.sh`](./scripts/ark-dev.sh) script helps manage this environment.

**Prerequisites:**

- **Docker**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).

**Setup & Usage:**

1.  **Bootstrap the environment**
    This clones the `bark` repository and prepares the Docker setup.

    ```bash
    ./scripts/ark-dev.sh setup
    ```

2.  **Start the services**
    This will start `bitcoind`, `aspd`, and `bark` in the background.

    ```bash
    ./scripts/ark-dev.sh up
    ```

3.  **Create and fund wallets**
    - Create a Bitcoin Core wallet: `./scripts/ark-dev.sh create-wallet`
    - Generate blocks to fund it: `./scripts/ark-dev.sh generate 101`
    - Create a bark wallet: `./scripts/ark-dev.sh create-bark-wallet`
    - Fund the ASPD: `./scripts/ark-dev.sh fund-aspd 1`
    - For interacting bark wallet: `./scripts/ark-dev.sh bark`
    - For interacting with ASPD RPC: `./scripts/ark-dev.sh aspd`

4.  **Stop the services**

    ```bash
    # Stop services
    ./scripts/ark-dev.sh stop

    # Stop and delete volumes
    ./scripts/ark-dev.sh down
    ```

For more commands and details, run `./scripts/ark-dev.sh` without arguments.

---

## 🏃 Running the Application

This project uses various scripts to run the application in different environments (Mainnet, Signet, Regtest).

Please see the `scripts` section in the [`package.json`](./package.json) file for a full list of available commands.

**Example (running on Android Regtest):**

```bash
bun client android:regtest:debug
```

**Example (running on iOS Regtest):**

```bash
bun client ios:regtest:debug
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

You can create production-ready application binaries using the build scripts.

Please see the `scripts` section in the [`package.json`](./package.json) file for commands starting with `build:`.

**Note on Code Signing:** For production builds, you will need to configure your own signing keys. Refer to the official React Native and Expo documentation for code signing on [Android](https://reactnative.dev/docs/signed-apk-android) and iOS.

---

## 📜 License

This project is licensed under the MIT License.
