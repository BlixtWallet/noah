import { ExpoConfig } from "expo/config";

const variants = {
  signet: {
    name: "Noah (Signet)",
  },
  regtest: {
    name: "Noah (Regtest)",
  },
  mainnet: {
    name: "Noah",
  },
};

type AppVariant = keyof typeof variants;

const getAppVariant = (): AppVariant => {
  const variantEnv = process.env.APP_VARIANT;
  if (variantEnv && variantEnv in variants) {
    return variantEnv as AppVariant;
  }
  // Default to mainnet for generic commands like `expo start`
  return "signet";
};

const appVariant = getAppVariant();
const variantConfig = variants[appVariant];

const config: { expo: ExpoConfig } = {
  expo: {
    name: variantConfig.name,
    slug: "noah",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
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
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    extra: {
      APP_VARIANT: appVariant,
    },
  },
};

export default config;
