import { ExpoConfig } from "expo/config";

const config: { expo: ExpoConfig } = {
  expo: {
    name: "Noah",
    slug: "noah",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    experiments: {
      reactCompiler: true,
    },
    plugins: [
      [
        "react-native-share",
        {
          ios: ["fb", "instagram", "twitter", "tiktoksharesdk"],
          android: [
            "com.facebook.katana",
            "com.instagram.android",
            "com.twitter.android",
            "com.zhiliaoapp.musically",
          ],
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
        },
      ],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.anonymous.noah",
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
      adaptiveIcon: {
        foregroundImage:
          "./assets/All_Files/android/Android_Adaptive/android_adaptive_foreground.png",
        backgroundColor: "#000000",
      },
      edgeToEdgeEnabled: true,
      package: "com.anonymous.noah",
      splash: {
        image: "./assets/All_Files/splash_screens/splash_screen_android.png",
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    },
    androidStatusBar: {
      barStyle: "light-content",
      backgroundColor: "#000000",
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    extra: {},
  },
};

export default config;
