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
  type OnchainBalanceResult,
  type OffchainBalanceResult,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { useWalletStore } from "../store/walletStore";
import { useTransactionStore } from "../store/transactionStore";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";
import { deriveStoreNextKeypair, peakKeyPair } from "./paymentsApi";
import { err, ok, Result, ResultAsync } from "neverthrow";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;
const USERNAME = "noah";

const createWalletFromMnemonic = async (mnemonic: string): Promise<Result<void, Error>> => {
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

  const setResult = await ResultAsync.fromPromise(
    Keychain.setGenericPassword(USERNAME, mnemonic, { service: MNEMONIC_KEYCHAIN_SERVICE }),
    (e) => e as Error,
  );

  if (setResult.isErr()) {
    return err(setResult.error);
  }

  const loadResult = await ResultAsync.fromPromise(
    loadWalletNitro(ARK_DATA_PATH, mnemonic),
    (e) => e as Error,
  );
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

  useWalletStore.getState().setStaticVtxoPubkey(keypairResult.value.public_key);
  return ok(undefined);
};

export const createWallet = async (): Promise<Result<void, Error>> => {
  const mnemonicResult = await ResultAsync.fromPromise(createMnemonic(), (e) => e as Error);
  if (mnemonicResult.isErr()) {
    return err(mnemonicResult.error);
  }
  return createWalletFromMnemonic(mnemonicResult.value);
};

const loadWallet = async (): Promise<Result<boolean, Error>> => {
  const credentialsResult = await ResultAsync.fromPromise(
    Keychain.getGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE }),
    (e) => e as Error,
  );

  if (credentialsResult.isErr()) {
    return err(credentialsResult.error);
  }

  const credentials = credentialsResult.value;
  if (!credentials || !credentials.password) {
    return err(new Error("No wallet found. Please create a wallet first."));
  }

  const loadResult = await ResultAsync.fromPromise(
    loadWalletNitro(ARK_DATA_PATH, credentials.password),
    (e) => e as Error,
  );

  if (loadResult.isErr()) {
    return err(loadResult.error);
  }

  return ok(true);
};

export const loadWalletIfNeeded = async (): Promise<Result<boolean, Error>> => {
  const isLoadedResult = await ResultAsync.fromPromise(isWalletLoadedNitro(), (e) => e as Error);
  if (isLoadedResult.isErr()) {
    return err(isLoadedResult.error);
  }

  if (isLoadedResult.value) {
    return ok(true);
  }

  return loadWallet();
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

export const signMessage = async (
  message: string,
  index: number,
): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(signMessageNitro(message, index), (e) => e as Error);
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
  const existsResult = await ResultAsync.fromPromise(RNFS.exists(ARK_DATA_PATH), (e) => e as Error);
  if (existsResult.isErr()) return err(existsResult.error);

  if (existsResult.value) {
    const unlinkResult = await ResultAsync.fromPromise(
      RNFS.unlink(ARK_DATA_PATH),
      (e) => e as Error,
    );
    if (unlinkResult.isErr()) return err(unlinkResult.error);
  }

  const resetResult = await ResultAsync.fromPromise(
    Keychain.resetGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE }),
    (e) => e as Error,
  );
  if (resetResult.isErr()) return err(resetResult.error);

  useWalletStore.getState().reset();
  useTransactionStore.getState().reset();
  return ok(undefined);
};
