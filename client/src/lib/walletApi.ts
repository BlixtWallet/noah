import {
  createMnemonic,
  loadWallet as loadWalletNitro,
  createWallet as createWalletNitro,
  onchainBalance as onchainBalanceNitro,
  offchainBalance as offchainBalanceNitro,
  sync as syncNitro,
  onchainSync as onchainSyncNitro,
  closeWallet as closeWalletNitro,
  isWalletLoaded as isWalletLoadedNitro,
  signMessage as signMessageNitro,
  verifyMessage as verifyMessageNitro,
  maintenance as maintenanceNitro,
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

  if (await isWalletLoadedNitro()) {
    await closeWalletNitro();
  }

  await createWalletNitro(ARK_DATA_PATH, {
    ...creationConfig,
    mnemonic,
  });

  await Keychain.setGenericPassword(USERNAME, mnemonic, {
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  // After creating the wallet, load wallet into memory.
  await loadWalletNitro(ARK_DATA_PATH, mnemonic);

  // The first time we generate a pubkey, the index should be undefined.
  // After that, we can use index 0 to get the static pubkey.
  await deriveStoreNextKeypair();
  const keypair = await peakKeyPair(0);
  useWalletStore.getState().setStaticVtxoPubkey(keypair.public_key);
};

export const createWallet = async () => {
  const mnemonic = await createMnemonic();

  await createWalletFromMnemonic(mnemonic);
};

const loadWallet = async () => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials || !credentials.password) {
    throw new Error("No wallet found. Please create a wallet first.");
  }

  await loadWalletNitro(ARK_DATA_PATH, credentials.password);
  return true;
};

export const loadWalletIfNeeded = async () => {
  const isLoaded = await isWalletLoadedNitro();
  if (isLoaded) {
    return true;
  }

  return await loadWallet();
};

export const fetchOnchainBalance = async () => {
  const newBalance = await onchainBalanceNitro();
  return newBalance;
};

export const fetchOffchainBalance = async () => {
  const newBalance = await offchainBalanceNitro();
  return newBalance;
};

export const sync = async () => {
  await syncNitro();
};

export const signMessage = async (message: string, index: number) => {
  const signature = await signMessageNitro(message, index);
  return signature;
};

export const verifyMessage = async (message: string, signature: string, publicKey: string) => {
  const isValid = await verifyMessageNitro(message, signature, publicKey);
  return isValid;
};

export const onchainSync = async () => {
  await onchainSyncNitro();
};

export const maintanance = async () => {
  await maintenanceNitro();
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
