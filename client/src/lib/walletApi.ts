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
  verifyMessage as verifyMessageNitro,
  maintenance as maintenanceNitro,
  maintenanceRefresh as maintenanceRefreshNitro,
  maintenanceWithOnchain as maintenanceWithOnchainNitro,
  signMesssageWithMnemonic as signMessageWithMnemonicNitro,
  deriveKeypairFromMnemonic as deriveKeypairFromMnemonicNitro,
  vtxos as vtxosNitro,
  getExpiringVtxos as getExpiringVtxosNitro,
  type OnchainBalanceResult,
  type OffchainBalanceResult,
  KeyPairResult,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import RNFSTurbo from "react-native-fs-turbo";
import { Platform } from "react-native";
import * as Device from "expo-device";
import {
  ARK_DATA_PATH,
  CACHES_DIRECTORY_PATH,
  DOCUMENT_DIRECTORY_PATH,
  MNEMONIC_KEYCHAIN_SERVICE,
  ACTIVE_WALLET_CONFIG,
} from "../constants";
import { deriveStoreNextKeypair, peakKeyPair, getMnemonic, setMnemonic } from "./crypto";
import { err, ok, Result, ResultAsync } from "neverthrow";
import logger from "~/lib/log";
import { isGooglePlayServicesAvailable, storeNativeMnemonic } from "noah-tools";

const log = logger("walletApi");

const createWalletFromMnemonic = async (mnemonic: string): Promise<Result<void, Error>> => {
  const isLoadedResult = await ResultAsync.fromPromise(isWalletLoadedNitro(), (e) => e as Error);
  if (isLoadedResult.isErr()) return err(isLoadedResult.error);

  if (isLoadedResult.value) {
    const closeResult = await ResultAsync.fromPromise(closeWalletNitro(), (e) => e as Error);
    if (closeResult.isErr()) return err(closeResult.error);
  }

  const createResult = await ResultAsync.fromPromise(
    createWalletNitro(ARK_DATA_PATH, { ...ACTIVE_WALLET_CONFIG, mnemonic }),
    (e) => e as Error,
  );

  if (createResult.isErr()) {
    return err(createResult.error);
  }

  const setMnemonicResult = await ResultAsync.fromPromise(setMnemonic(mnemonic), (e) => e as Error);

  if (setMnemonicResult.isErr()) {
    return err(setMnemonicResult.error);
  }

  if (shouldStoreNativeMnemonic()) {
    const storeNativeResult = await ResultAsync.fromPromise(
      storeNativeMnemonic(mnemonic),
      (e) => e as Error,
    );
    if (storeNativeResult.isErr()) {
      log.w("Failed to store mnemonic natively for push service", [storeNativeResult.error]);
    }
  }

  const loadResult = await loadWallet(mnemonic);
  if (loadResult.isErr()) {
    return err(loadResult.error);
  }

  const deriveResult = await deriveStoreNextKeypair();
  if (deriveResult.isErr()) {
    return err(deriveResult.error);
  }

  const keypairResult = await peakKeyPair(0);
  if (keypairResult.isErr()) {
    return err(keypairResult.error);
  }

  return ok(undefined);
};

export const createWallet = async (): Promise<Result<void, Error>> => {
  const mnemonicResult = await ResultAsync.fromPromise(createMnemonic(), (e) => e as Error);
  if (mnemonicResult.isErr()) {
    return err(mnemonicResult.error);
  }
  return createWalletFromMnemonic(mnemonicResult.value);
};

export const restoreWallet = async (mnemonic: string): Promise<Result<boolean, Error>> => {
  const setResult = await ResultAsync.fromPromise(setMnemonic(mnemonic), (e) => e as Error);
  if (setResult.isErr()) {
    return err(setResult.error);
  }

  if (shouldStoreNativeMnemonic()) {
    const storeNativeResult = await ResultAsync.fromPromise(
      storeNativeMnemonic(mnemonic),
      (e) => e as Error,
    );
    if (storeNativeResult.isErr()) {
      log.w("Failed to store mnemonic natively for push service", [storeNativeResult.error]);
    }
  }
  return loadWallet(mnemonic);
};

const loadWallet = async (mnemonic: string): Promise<Result<boolean, Error>> => {
  const loadResult = await ResultAsync.fromPromise(
    loadWalletNitro(ARK_DATA_PATH, {
      mnemonic,
      ...ACTIVE_WALLET_CONFIG,
    }),
    (e) => e as Error,
  );

  if (loadResult.isErr()) {
    return err(loadResult.error);
  }

  return ok(true);
};

const loadWalletFromStorage = async (): Promise<Result<boolean, Error>> => {
  const mnemonicResult = await getMnemonic();

  if (mnemonicResult.isErr()) {
    return err(mnemonicResult.error);
  }

  const mnemonic = mnemonicResult.value;
  if (!mnemonic) {
    return err(new Error("No wallet found. Please create a wallet first."));
  }

  return loadWallet(mnemonic);
};

const shouldStoreNativeMnemonic = () => {
  return Platform.OS === "android" && Device.isDevice && !isGooglePlayServicesAvailable();
};

export const loadWalletIfNeeded = async (): Promise<Result<boolean, Error>> => {
  const isLoadedResult = await ResultAsync.fromPromise(isWalletLoadedNitro(), (e) => e as Error);
  if (isLoadedResult.isErr()) {
    return err(isLoadedResult.error);
  }

  if (isLoadedResult.value) {
    return ok(true);
  }

  return loadWalletFromStorage();
};

export const closeWalletIfLoaded = async (): Promise<Result<boolean, Error>> => {
  const isLoaded = await isWalletLoadedNitro();

  log.d("Checking if wallet is loaded:", [isLoaded]);

  if (!isLoaded) {
    return ok(true);
  }
  const closeWalletResult = await ResultAsync.fromPromise(closeWalletNitro(), (e) => e as Error);
  if (closeWalletResult.isErr()) {
    log.w("Failed to close wallet:", [closeWalletResult.error]);
    return ok(false);
  }

  return ok(true);
};

export const fetchOnchainBalance = async (): Promise<Result<OnchainBalanceResult, Error>> => {
  return ResultAsync.fromPromise(onchainBalanceNitro(), (e) => e as Error);
};

export const fetchOffchainBalance = async (): Promise<Result<OffchainBalanceResult, Error>> => {
  return ResultAsync.fromPromise(offchainBalanceNitro(), (e) => e as Error);
};

export const sync = async (): Promise<Result<void, Error>> => {
  return ResultAsync.fromPromise(syncNitro(), (e) => e as Error);
};

export const signMesssageWithMnemonic = async (
  k1: string,
  mnemonic: string,
  network: string,
  index: number,
): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(
    signMessageWithMnemonicNitro(k1, mnemonic, network, index),
    (e) => e as Error,
  );
};

export const deriveKeypairFromMnemonic = async (
  mnemonic: string,
  network: string,
  index: number,
): Promise<Result<KeyPairResult, Error>> => {
  return ResultAsync.fromPromise(
    deriveKeypairFromMnemonicNitro(mnemonic, network, index),
    (e) => e as Error,
  );
};

export const verifyMessage = async (
  message: string,
  signature: string,
  publicKey: string,
): Promise<Result<boolean, Error>> => {
  return ResultAsync.fromPromise(
    verifyMessageNitro(message, signature, publicKey),
    (e) => e as Error,
  );
};

export const onchainSync = async (): Promise<Result<void, Error>> => {
  return ResultAsync.fromPromise(onchainSyncNitro(), (e) => e as Error);
};

export const maintanance = async (): Promise<Result<void, Error>> => {
  return ResultAsync.fromPromise(maintenanceNitro(), (e) => e as Error);
};

export const maintenanceRefresh = async (): Promise<Result<void, Error>> => {
  return ResultAsync.fromPromise(maintenanceRefreshNitro(), (e) => e as Error);
};

export const maintenanceWithOnchain = async (): Promise<Result<void, Error>> => {
  return ResultAsync.fromPromise(maintenanceWithOnchainNitro(), (e) => e as Error);
};

export const deleteWallet = async (): Promise<Result<void, Error>> => {
  // Check if document directory path exists
  // Then recursively delete all files and directories within it
  const documentDirectoryExists = RNFSTurbo.exists(DOCUMENT_DIRECTORY_PATH);

  if (documentDirectoryExists) {
    const dircontents = RNFSTurbo.readdir(DOCUMENT_DIRECTORY_PATH);
    log.d(`Directory contents: ${dircontents}`);
    dircontents.forEach((n) => {
      log.d(`Deleting file: ${n}`);
      RNFSTurbo.unlink(`${DOCUMENT_DIRECTORY_PATH}/${n}`);
    });
  }

  // Check if cache directory path exists
  // Then recursively delete all files and directories within it
  const cacheDirectoryExists = RNFSTurbo.exists(CACHES_DIRECTORY_PATH);

  if (cacheDirectoryExists) {
    const cacheContents = RNFSTurbo.readdir(CACHES_DIRECTORY_PATH);
    log.d(`Cache contents: ${cacheContents}`);

    cacheContents.forEach((n) => {
      log.d(`Deleting file: ${n}`);
      RNFSTurbo.unlink(`${CACHES_DIRECTORY_PATH}/${n}`);
    });
  }

  const resetResult = await ResultAsync.fromPromise(
    Keychain.resetGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE }),
    (e) => e as Error,
  );
  if (resetResult.isErr()) return err(resetResult.error);

  return ok(undefined);
};

export const getVtxos = async () => {
  return ResultAsync.fromPromise(vtxosNitro(), (e) => e as Error);
};

export const getExpiringVtxos = async () => {
  return ResultAsync.fromPromise(
    getExpiringVtxosNitro(ACTIVE_WALLET_CONFIG.config?.vtxo_refresh_expiry_threshold || 288),
    (e) => e as Error,
  );
};
