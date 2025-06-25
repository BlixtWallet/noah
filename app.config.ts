import { ExpoConfig } from "expo/config";

const variants = {
  signet: {
    name: "Noah (Signet)",
    bundleIdentifier: "com.anonymous.noah.signet",
    packageName: "com.anonymous.noah.signet",
  },
  regtest: {
    name: "Noah (Regtest)",
    bundleIdentifier: "com.anonymous.noah.regtest",
    packageName: "com.anonymous.noah.regtest",
  },
  mainnet: {
    name: "Noah",
    bundleIdentifier: "com.anonymous.noah",
    packageName: "com.anonymous.noah",
  },
};

type AppVariant = keyof typeof variants;

const getAppVariant = (): AppVariant => {
  const variantEnv = process.env.APP_VARIANT;
  if (variantEnv && variantEnv in variants) {
    return variantEnv as AppVariant;
  }
  console.log("App variant env", variantEnv);
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
      bundleIdentifier: variantConfig.bundleIdentifier,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      package: variantConfig.packageName,
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
