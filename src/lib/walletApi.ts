import {
  createMnemonic,
  loadWallet as loadWalletNitro,
  onchainBalance as onchainBalanceNitro,
  offchainBalance as offchainBalanceNitro,
  sync as syncNitro,
  onchainSync as onchainSyncNitro,
  closeWallet as closeWalletNitro,
  isWalletLoaded,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { useWalletStore } from "../store/walletStore";
import { useTransactionStore } from "../store/transactionStore";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";
import { deriveStoreNextKeypair, peakKeyPair } from "./paymentsApi";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;
const USERNAME = "noah";

const createWalletFromMnemonic = async (mnemonic: string) => {
  const { config } = useWalletStore.getState();

  const creationConfig =
    APP_VARIANT === "regtest"
      ? {
          regtest: true,
          signet: false,
          bitcoin: false,
          config: {
            bitcoind: config.bitcoind,
            asp: config.asp,
            bitcoind_user: config.bitcoind_user,
            bitcoind_pass: config.bitcoind_pass,
            vtxo_refresh_expiry_threshold: 288,
            fallback_fee_rate: 10000,
          },
        }
      : {
          regtest: false,
          signet: APP_VARIANT === "signet",
          bitcoin: APP_VARIANT === "mainnet",
          config: {
            esplora: config.esplora,
            asp: config.asp,
            vtxo_refresh_expiry_threshold: 288,
            fallback_fee_rate: 10000,
          },
        };

  if (await isWalletLoaded()) {
    console.log("Wallet is already loaded, closing it before creating a new one");
    await closeWalletNitro();
  }

  await loadWalletNitro(ARK_DATA_PATH, {
    ...creationConfig,
    mnemonic,
  });

  console.log("Wallet created successfully with mnemonic");

  await Keychain.setGenericPassword(USERNAME, mnemonic, {
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  console.log("Mnemonic saved to keychain");

  // The first time we generate a pubkey, the index should be undefined.
  // After that, we can use index 0 to get the static pubkey.
  await deriveStoreNextKeypair();
  const pubkey = await peakKeyPair(0);
  useWalletStore.getState().setStaticVtxoPubkey(pubkey);
};

export const createWallet = async () => {
  const mnemonic = await createMnemonic();

  await createWalletFromMnemonic(mnemonic);
};

export const loadWallet = async () => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    // This is not an error, it just means the wallet is not created yet.
    return false;
  }

  await createWalletFromMnemonic(credentials.password);
  return true;
};

export const fetchOnchainBalance = async () => {
  const newBalance = await onchainBalanceNitro();
  console.log("fetchOnchainBalance result", newBalance);
  return newBalance;
};

export const fetchOffchainBalance = async () => {
  const newBalance = await offchainBalanceNitro();
  console.log("fetchOffchainBalance result", newBalance);
  return newBalance;
};

export const sync = async () => {
  await syncNitro();
};

export const onchainSync = async () => {
  await onchainSyncNitro();
};

export const deleteWallet = async () => {
  try {
    // Delete the wallet data directory
    const dataDirExists = await RNFS.exists(ARK_DATA_PATH);
    if (dataDirExists) {
      await RNFS.unlink(ARK_DATA_PATH);
    }

    // Remove the mnemonic from keychain
    await Keychain.resetGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE });
    useWalletStore.getState().reset();
    useTransactionStore.getState().reset();
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    throw new Error(
      `Failed to delete wallet: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
