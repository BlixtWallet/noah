import { ExpoConfig } from "expo/config";

const config: { expo: ExpoConfig } = {
  expo: {
    name: "Noah",
    slug: "noah",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    plugins: [
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
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.anonymous.noah",
      icon: "./assets/appstore.png",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/playstore.png",
        backgroundColor: "#000000",
      },
      icon: "./assets/playstore.png",
      edgeToEdgeEnabled: true,
      package: "com.anonymous.noah",
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
