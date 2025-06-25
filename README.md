# 🪙 Noah Wallet

Noah is a modern, self-custodial mobile wallet for Ark, a Bitcoin Layer 2 protocol. It is built with React Native and Expo.

---

## Table of Contents

- [✨ Core Technologies](#-core-technologies)
- [🛠️ Prerequisites](#️-prerequisites)
- [🚀 Getting Started](#-getting-started)
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

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following tools installed on your system:

- **Bun**: This project uses Bun for package management and script running. [Installation Guide](https://bun.sh/docs/installation).
- **Git**: For version control.
- **A code editor**: [Visual Studio Code](https://code.visualstudio.com/) is recommended.
- **iOS Development**:
  - Xcode (from the Mac App Store)
  - CocoaPods (`sudo gem install cocoapods`)
- **Android Development**:
  - Android Studio & the Android SDK
  - Java Development Kit (JDK)

---

## 🚀 Getting Started

Follow these steps to get the project up and running on your local machine.

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/BlixtWallet/noah.git
    cd noah
    ```

2.  **Install JavaScript Dependencies**
    This will install all the necessary packages defined in `package.json`.
    ```bash
    bun install
    ```

3.  **Install iOS Dependencies**
    This step links the native iOS libraries required by the project across all build targets.
    ```bash
    cd ios
    pod install
    cd ..
    ```

After these steps, the project is ready to run.

---

## 🏃 Running the Application

This project is configured with different build flavors for development and testing.

### 🤖 Android

Run one of the following commands to build and launch a specific Android flavor.

-   **Mainnet:**
    ```bash
    bun run android:mainnet
    ```
-   **Signet:**
    ```bash
    bun run android:signet
    ```
-   **Regtest:**
    ```bash
    bun run android:regtest
    ```

### 🍏 iOS

The iOS build system uses Xcode Schemes to differentiate between flavors. Each script specifies the correct scheme and build configuration (`Debug` or `Release`).

**Development (Debug) Builds:**

-   **Mainnet:**
    ```bash
    bun run ios:mainnet:debug
    ```
-   **Signet:**
    ```bash
    bun run ios:signet:debug
    ```
-   **Regtest:**
    ```bash
    bun run ios:regtest:debug
    ```

**Production-like (Release) Builds:**

-   **Mainnet:**
    ```bash
    bun run ios:mainnet:release
    ```
-   **Signet:**
    ```bash
    bun run ios:signet:release
    ```
-   **Regtest:**
    ```bash
    bun run ios:regtest:release
    ```

---

## 📦 Building for Production

The following scripts are configured to create standalone production-ready application binaries (`.apk` or `.aab`) for Android.

**Note on Code Signing:** For production builds, you will need to configure your own signing keys. The Android build is currently configured to use the default debug keystore. Please refer to the [React Native documentation for signing Android apps](https://reactnative.dev/docs/signed-apk-android).

-   **Build Mainnet Release:**
    ```bash
    bun run build:android:mainnet:release
    ```
-   **Build Signet Release:**
    ```bash
    bun run build:android:signet:release
    ```
-   **Build Regtest Release:**
    ```bash
    bun run build:android:regtest:release
    ```

---

## 📜 License

This project is licensed under the MIT License.
