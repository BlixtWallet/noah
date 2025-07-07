import {
  createMnemonic,
  loadWallet as loadWalletNitro,
  getBalance as getBalanceNitro,
  closeWallet as closeWalletNitro,
  isWalletLoaded,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { useWalletStore } from "../store/walletStore";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";

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

  await loadWalletNitro(ARK_DATA_PATH, {
    ...creationConfig,
    mnemonic,
  });

  await Keychain.setGenericPassword(USERNAME, mnemonic, {
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });
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

export const fetchBalance = async (no_sync: boolean) => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    // This is not an error, it just means the wallet is not created yet.
    return null;
  }

  const newBalance = await getBalanceNitro(no_sync);

  console.log("fetchBalance result", newBalance, no_sync);
  return newBalance;
};

export const deleteWallet = async () => {
  try {
    // Close the wallet if open
    if (!isWalletLoaded()) {
      await closeWalletNitro();
    }

    // Delete the wallet data directory
    const dataDirExists = await RNFS.exists(ARK_DATA_PATH);
    if (dataDirExists) {
      await RNFS.unlink(ARK_DATA_PATH);
    }

    // Remove the mnemonic from keychain
    await Keychain.resetGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE });
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    throw new Error(
      `Failed to delete wallet: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
