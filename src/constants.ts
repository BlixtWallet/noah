import type { BarkCreateOpts } from "react-native-nitro-ark";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { APP_VARIANT } from "./config";
import { decode } from "light-bolt11-decoder";
import { validate, Network } from "bitcoin-address-validation";
import { Platform } from "react-native";

const isEmail = (n: string): boolean => /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(n);
const isOnion = (n: string): boolean => /.onion$/.test(n);
const isUsername = (n: string): boolean => /^[a-z0-9_.]*$/.test(n);
const parseEmail = (email: string): string[] => email.split("@");

export const PLATFORM = Platform.OS;

const getArkDataPath = (): string => {
  switch (APP_VARIANT) {
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
  regtest: false,
  signet: true,
  bitcoin: false,
  config: {
    esplora: "esplora.signet.2nd.dev",
    asp: "ark.signet.2nd.dev",
    vtxo_refresh_expiry_threshold: 288,
    fallback_fee_rate: 10000,
  },
};

export const REGTEST_CONFIG: WalletCreationOptions = {
  regtest: true,
  signet: false,
  bitcoin: false,
  config: {
    bitcoind: PLATFORM === "android" ? "http://10.0.2.2:18443" : "http://localhost:18443",
    asp: PLATFORM === "android" ? "http://10.0.2.2:3535" : "http://localhost:3535",
    bitcoind_user: "second",
    bitcoind_pass: "ark",
    vtxo_refresh_expiry_threshold: 288,
    fallback_fee_rate: 10000,
  },
};

// In a real app, you would have a separate production configuration.
export const PRODUCTION_CONFIG: WalletCreationOptions = {
  regtest: false,
  signet: false,
  bitcoin: true,
  config: {
    // This is a public esplora instance, you might want to run your own.
    esplora: "https://mempool.space/api",
    // This ASP is likely for a local regtest setup,
    // you will need a production ASP for mainnet.
    asp: "http://192.168.4.252:3535",
    vtxo_refresh_expiry_threshold: 288,
    fallback_fee_rate: 10000,
  },
};

const getActiveWalletConfig = (): WalletCreationOptions => {
  switch (APP_VARIANT) {
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

const network = () => {
  switch (APP_VARIANT) {
    case "mainnet":
      return Network.mainnet;
    case "signet":
      return Network.signet;
    case "regtest":
      return Network.regtest;
  }
};

export const isArkPublicKey = (n: string) => !!n && /^0[2-3][0-9A-F]{64}$/i.test(n);

export const isValidBitcoinAddress = (address: string) => validate(address, network());

export const isValidBolt11 = (invoice: string) => {
  try {
    decode(invoice);
    return true;
    /* eslint-disable @typescript-eslint/no-unused-vars */
  } catch (_e: any) {
    return false;
  }
};

export const decodeBolt11 = (invoice: string) => {
  try {
    return decode(invoice);
  } catch (error) {
    return null;
  }
};

export const msatToSatoshi = (msat: number) => msat / 1000;

export const coingeckoEndpoint =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

export const isValidLightningAddress = (url: string): boolean => {
  if (!isEmail(url)) {
    return false;
  }

  const [username, domain] = parseEmail(url);

  if (!isUsername(username)) {
    return false;
  }

  if (!!isOnion(domain)) {
    return false;
  }

  return true;
};

export const BITCOIN_FACTS = [
  "There can only ever be 21 million bitcoin.",
  "Fix the money, fix the world.",
  "Money for everyone, by everyone.",
  "Send money to anyone, anywhere, anytime.",
  "No one can freeze your funds.",
  "A 'satoshi' is its smallest unit.",
  "It's freedom in your pocket.",
  "Hope for a fairer financial system.",
  "Taxation is theft.",
  "Power back to the people.",
  "Be your own bank.",
  "A powerful tool for savers.",
  "The future of money is here.",
  "Not your keys, not your coins.",
  "Stay humble, stack sats.",
  "In code we trust.",
  "Governments can print money, but not Bitcoin.",
  "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks.",
  "Vires in numeris. (Strength in numbers)",
  "\"If you don't believe it or don't get it, I don't have time to try to convince you, sorry.\" - Satoshi Nakamoto",
  "There is no second best.",
  "When in doubt, zoom out.",
  "Separate money and state.",
  "Tick tock next block.",
];
