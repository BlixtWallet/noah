import { ExpoConfig } from "expo/config";

const config: { expo: ExpoConfig } = {
  expo: {
    name: "Noah",
    slug: "noahs-ark-wallet",
    version: "0.0.4",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    experiments: {
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "6e79dffb-dcd4-4f3d-b596-638b16377eb0",
      },
    },
    plugins: [
      "expo-sqlite",
      [
        "expo-local-authentication",
        {
          faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos so that you can pick screenshots to share feedback.",
        },
      ],
      [
        "react-native-share",
        {
          ios: ["whatsapp", "telegram", "signal"],
          android: ["com.whatsapp", "org.telegram.messenger", "org.thoughtcrime.securesms"],
          enableBase64ShareAndroid: true,
        },
      ],
      [
        "react-native-edge-to-edge",
        {
          android: {
            parentTheme: "Material3",
            enforceNavigationBarContrast: false,
          },
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            buildArchs: ["arm64-v8a", "x86_64"],
          },
          ios: {
            extraPods: [
              { name: "SDWebImage", modular_headers: true },
              { name: "SDWebImageSVGCoder", modular_headers: true },
            ],
          },
        },
      ],
      [
        "react-native-vision-camera",
        {
          cameraPermissionText: "$(PRODUCT_NAME) needs access to your Camera.",
          enableCodeScanner: true,
        },
      ],
      "expo-notifications",
    ],
    ios: {
      buildNumber: "7",
      supportsTablet: true,
      bundleIdentifier: "com.noahwallet.mainnet",
      scheme: "Noah-Signet",
      infoPlist: {
        UIBackgroundModes: ["remote-notification", "fetch"],
      },
      splash: {
        image: "./assets/All_Files/splash_screens/splash_screen_ios.png",
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
      icon: {
        dark: "./assets/All_Files/light_dark_tinted/icon_dark_mode_ios.png",
        light: "./assets/All_Files/light_dark_tinted/icon_light_mode_ios.png",
        tinted: "./assets/All_Files/light_dark_tinted/icon_clear_tinted_ios.png",
      },
    },
    android: {
      versionCode: 6,
      adaptiveIcon: {
        foregroundImage:
          "./assets/All_Files/android/Android_Adaptive/android_adaptive_foreground.png",
        backgroundColor: "#000000",
      },
      edgeToEdgeEnabled: true,
      package: "com.noahwallet",
      splash: {
        image: "./assets/All_Files/splash_screens/splash_screen_android.png",
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
      softwareKeyboardLayoutMode: "pan",
    },
    androidStatusBar: {
      barStyle: "light-content",
      backgroundColor: "#000000",
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
  },
};

export default config;
