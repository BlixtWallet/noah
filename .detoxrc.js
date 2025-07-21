/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "e2e/jest.config.js",
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    "ios.regtest.debug": {
      type: "ios.app",
      binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/noah.app",
      build:
        "xcodebuild -workspace ios/noah.xcworkspace -scheme Noah-Regtest -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "ios.regtest.release": {
      type: "ios.app",
      binaryPath: "ios/build/Build/Products/Release-iphonesimulator/noah.app",
      build:
        "xcodebuild -workspace ios/noah.xcworkspace -scheme Noah-Regtest -configuration Release -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "android.regtest.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/regtest/app-regtest-debug.apk",
      build:
        "cd android && ./gradlew assembleRegtestDebug assembleAndroidTest -DtestBuildType=debug",
    },
    "android.regtest.release": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/regtest/app-regtest-release.apk",
      build:
        "cd android && ./gradlew assembleRegtestRelease assembleAndroidTest -DtestBuildType=release",
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: "iPhone 15",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: "Pixel_9_API_35",
      },
    },
  },
  configurations: {
    "ios.sim.regtest.debug": {
      device: "simulator",
      app: "ios.regtest.debug",
    },
    "ios.sim.regtest.release": {
      device: "simulator",
      app: "ios.regtest.release",
    },
    "android.emu.regtest.debug": {
      device: "emulator",
      app: "android.regtest.debug",
    },
    "android.emu.regtest.release": {
      device: "emulator",
      app: "android.regtest.release",
    },
  },
};
