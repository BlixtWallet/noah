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
import { err, ok, Result } from "neverthrow";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;
const USERNAME = "noah";

const createWalletFromMnemonic = async (mnemonic: string): Promise<Result<void, Error>> => {
  try {
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
  } catch (error) {
    return err(error as Error);
  }
};

export const createWallet = async (): Promise<Result<void, Error>> => {
  try {
    const mnemonic = await createMnemonic();
    return await createWalletFromMnemonic(mnemonic);
  } catch (error) {
    return err(error as Error);
  }
};

const loadWallet = async (): Promise<Result<boolean, Error>> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: MNEMONIC_KEYCHAIN_SERVICE,
    });

    if (!credentials || !credentials.password) {
      return err(new Error("No wallet found. Please create a wallet first."));
    }

    await loadWalletNitro(ARK_DATA_PATH, credentials.password);
    return ok(true);
  } catch (error) {
    return err(error as Error);
  }
};

export const loadWalletIfNeeded = async (): Promise<Result<boolean, Error>> => {
  try {
    const isLoaded = await isWalletLoadedNitro();
    if (isLoaded) {
      return ok(true);
    }

    return await loadWallet();
  } catch (error) {
    return err(error as Error);
  }
};

export const fetchOnchainBalance = async (): Promise<Result<OnchainBalanceResult, Error>> => {
  try {
    const newBalance = await onchainBalanceNitro();
    return ok(newBalance);
  } catch (error) {
    return err(error as Error);
  }
};

export const fetchOffchainBalance = async (): Promise<Result<OffchainBalanceResult, Error>> => {
  try {
    const newBalance = await offchainBalanceNitro();
    return ok(newBalance);
  } catch (error) {
    return err(error as Error);
  }
};

export const sync = async (): Promise<Result<void, Error>> => {
  try {
    await syncNitro();
    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
};

export const signMessage = async (
  message: string,
  index: number,
): Promise<Result<string, Error>> => {
  try {
    const signature = await signMessageNitro(message, index);
    return ok(signature);
  } catch (error) {
    return err(error as Error);
  }
};

export const verifyMessage = async (
  message: string,
  signature: string,
  publicKey: string,
): Promise<Result<boolean, Error>> => {
  try {
    const isValid = await verifyMessageNitro(message, signature, publicKey);
    return ok(isValid);
  } catch (error) {
    return err(error as Error);
  }
};

export const onchainSync = async (): Promise<Result<void, Error>> => {
  try {
    await onchainSyncNitro();
    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
};

export const maintanance = async (): Promise<Result<void, Error>> => {
  try {
    await maintenanceNitro();
    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
};

export const deleteWallet = async (): Promise<Result<void, Error>> => {
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
    return ok(undefined);
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    return err(
      new Error(
        `Failed to delete wallet: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};
