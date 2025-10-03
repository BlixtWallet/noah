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
  signMesssageWithMnemonic as signMessageWithMnemonicNitro,
  deriveKeypairFromMnemonic as deriveKeypairFromMnemonicNitro,
  getVtxos as getVtxosNitro,
  getExpiringVtxos as getExpiringVtxosNitro,
  type OnchainBalanceResult,
  type OffchainBalanceResult,
  KeyPairResult,
  closeWallet,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import RNFSTurbo from "react-native-fs-turbo";
import { useWalletStore, type WalletConfig } from "../store/walletStore";
import {
  ARK_DATA_PATH,
  CACHES_DIRECTORY_PATH,
  DOCUMENT_DIRECTORY_PATH,
  MNEMONIC_KEYCHAIN_SERVICE,
} from "../constants";
import { APP_VARIANT } from "../config";
import { deriveStoreNextKeypair, peakKeyPair, getMnemonic, setMnemonic } from "./crypto";
import { err, ok, Result, ResultAsync } from "neverthrow";
import logger from "~/lib/log";

const log = logger("walletApi");

const vtxoRefreshExpiryThreshold = 288;
const fallBackFeeRate = 10000;

// Helper function to create network configuration
const createNetworkConfig = (config: WalletConfig) => {
  const baseConfig = {
    vtxo_refresh_expiry_threshold: vtxoRefreshExpiryThreshold,
    fallback_fee_rate: fallBackFeeRate,
  };

  if (APP_VARIANT === "regtest") {
    return {
      ...baseConfig,
      bitcoind: config.bitcoind,
      ark: config.ark,
      bitcoind_user: config.bitcoind_user,
      bitcoind_pass: config.bitcoind_pass,
    };
  } else {
    return {
      ...baseConfig,
      esplora: config.esplora,
      ark: config.ark,
    };
  }
};

// Helper function to create wallet creation configuration
const createWalletConfig = (config: WalletConfig) => {
  return {
    regtest: APP_VARIANT === "regtest",
    signet: APP_VARIANT === "signet",
    bitcoin: APP_VARIANT === "mainnet",
    config: createNetworkConfig(config),
  };
};

const createWalletFromMnemonic = async (
  mnemonic: string,
  config: WalletConfig,
): Promise<Result<void, Error>> => {
  const creationConfig = createWalletConfig(config);

  const isLoadedResult = await ResultAsync.fromPromise(isWalletLoadedNitro(), (e) => e as Error);
  if (isLoadedResult.isErr()) return err(isLoadedResult.error);

  if (isLoadedResult.value) {
    const closeResult = await ResultAsync.fromPromise(closeWalletNitro(), (e) => e as Error);
    if (closeResult.isErr()) return err(closeResult.error);
  }

  const createResult = await ResultAsync.fromPromise(
    createWalletNitro(ARK_DATA_PATH, { ...creationConfig, mnemonic }),
    (e) => e as Error,
  );

  if (createResult.isErr()) {
    return err(createResult.error);
  }

  const setMnemonicResult = await ResultAsync.fromPromise(setMnemonic(mnemonic), (e) => e as Error);

  if (setMnemonicResult.isErr()) {
    return err(setMnemonicResult.error);
  }

  const loadResult = await loadWallet(mnemonic, config);
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

export const createWallet = async (config: WalletConfig): Promise<Result<void, Error>> => {
  const mnemonicResult = await ResultAsync.fromPromise(createMnemonic(), (e) => e as Error);
  if (mnemonicResult.isErr()) {
    return err(mnemonicResult.error);
  }
  return createWalletFromMnemonic(mnemonicResult.value, config);
};

export const restoreWallet = async (
  mnemonic: string,
  config: WalletConfig,
): Promise<Result<boolean, Error>> => {
  const setResult = await ResultAsync.fromPromise(setMnemonic(mnemonic), (e) => e as Error);
  if (setResult.isErr()) {
    return err(setResult.error);
  }
  return loadWallet(mnemonic, config);
};

const loadWallet = async (
  mnemonic: string,
  config: WalletConfig,
): Promise<Result<boolean, Error>> => {
  const loadConfig = createWalletConfig(config);
  const loadResult = await ResultAsync.fromPromise(
    loadWalletNitro(ARK_DATA_PATH, {
      mnemonic,
      ...loadConfig,
    }),
    (e) => e as Error,
  );

  if (loadResult.isErr()) {
    return err(loadResult.error);
  }

  return ok(true);
};

const loadWalletFromStorage = async (config: WalletConfig): Promise<Result<boolean, Error>> => {
  const mnemonicResult = await getMnemonic();

  if (mnemonicResult.isErr()) {
    return err(mnemonicResult.error);
  }

  const mnemonic = mnemonicResult.value;
  if (!mnemonic) {
    return err(new Error("No wallet found. Please create a wallet first."));
  }

  return loadWallet(mnemonic, config);
};

export const loadWalletIfNeeded = async (): Promise<Result<boolean, Error>> => {
  const isLoadedResult = await ResultAsync.fromPromise(isWalletLoadedNitro(), (e) => e as Error);
  if (isLoadedResult.isErr()) {
    return err(isLoadedResult.error);
  }

  if (isLoadedResult.value) {
    return ok(true);
  }

  const config = useWalletStore.getState().config;
  return loadWalletFromStorage(config);
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
  return ResultAsync.fromPromise(getVtxosNitro(), (e) => e as Error);
};

export const getExpiringVtxos = async () => {
  return ResultAsync.fromPromise(getExpiringVtxosNitro(288), (e) => e as Error);
};
