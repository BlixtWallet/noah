import type { BarkCreateOpts } from "react-native-nitro-ark";
import * as RNFS from "@dr.pogodin/react-native-fs";
import Constants from "expo-constants";

const getArkDataPath = (): string => {
  const appVariant = Constants.expoConfig?.extra?.APP_VARIANT;
  switch (appVariant) {
    case "regtest":
      return `${RNFS.DocumentDirectoryPath}/noah-data-regtest`;
    case "signet":
      return `${RNFS.DocumentDirectoryPath}/noah-data-signet`;
    case "mainnet":
      return `${RNFS.DocumentDirectoryPath}/noah-data-mainnet`;
    default:
      // Default to signet for development builds that aren't launched via a profile
      return `${RNFS.DocumentDirectoryPath}/noah-data-signet`;
  }
};

export const ARK_DATA_PATH = getArkDataPath();

type WalletCreationOptions = Omit<BarkCreateOpts, "mnemonic">;

export const SIGNET_CONFIG: WalletCreationOptions = {
  force: true,
  regtest: false,
  signet: true,
  bitcoin: false,
  config: {
    esplora: "esplora.signet.2nd.dev",
    asp: "ark.signet.2nd.dev",
    vtxo_refresh_expiry_threshold: 288,
  },
};

export const REGTEST_CONFIG: WalletCreationOptions = {
  force: true,
  regtest: true,
  signet: false,
  bitcoin: false,
  config: {
    bitcoind: "http://192.168.4.253:18443",
    asp: "http://192.168.4.253:3535",
    bitcoind_user: "polaruser",
    bitcoind_pass: "polarpass",
    vtxo_refresh_expiry_threshold: 288,
  },
};

// In a real app, you would have a separate production configuration.
export const PRODUCTION_CONFIG: WalletCreationOptions = {
  force: false,
  regtest: false,
  signet: false,
  bitcoin: true,
  config: {
    // This is a public esplora instance, you might want to run your own.
    esplora: "https://mempool.space/api",
    // This ASP is likely for a local regtest setup,
    // you will need a production ASP for mainnet.
    asp: "http://192.168.4.253:3535",
    vtxo_refresh_expiry_threshold: 288,
  },
};

const getActiveWalletConfig = (): WalletCreationOptions => {
  const appVariant = Constants.expoConfig?.extra?.APP_VARIANT;
  switch (appVariant) {
    case "regtest":
      console.log("Using regtest configuration");
      return REGTEST_CONFIG;
    case "signet":
      console.log("Using signet configuration");
      return SIGNET_CONFIG;
    case "mainnet":
      console.log("Using production configuration");
      return PRODUCTION_CONFIG;
    default:
      // Default to signet for development builds that aren't launched via a profile
      console.log("No app variant set, defaulting to signet configuration");
      return SIGNET_CONFIG;
  }
};

export const ACTIVE_WALLET_CONFIG = getActiveWalletConfig();
