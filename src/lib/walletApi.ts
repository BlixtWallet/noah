import {
  createMnemonic,
  createWallet as createWalletNitro,
  getBalance as getBalanceNitro,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { useWalletStore } from "../store/walletStore";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;
const USERNAME = "noah";

export const createWallet = async () => {
  const { config } = useWalletStore.getState();
  const mnemonic = await createMnemonic();

  // Important note: force is set to true to ensure a new wallet
  // is created even if one already exists.
  // Only use force if you want to overwrite an existing wallet.
  const creationConfig =
    APP_VARIANT === "regtest"
      ? {
          force: true,
          regtest: true,
          signet: false,
          bitcoin: false,
          config: {
            bitcoind: config.bitcoind,
            asp: config.asp,
            bitcoind_user: config.bitcoind_user,
            bitcoind_pass: config.bitcoind_pass,
            vtxo_refresh_expiry_threshold: 288,
          },
        }
      : {
          force: true,
          regtest: false,
          signet: APP_VARIANT === "signet",
          bitcoin: APP_VARIANT === "mainnet",
          config: {
            esplora: config.esplora,
            asp: config.asp,
            vtxo_refresh_expiry_threshold: 288,
          },
        };

  await createWalletNitro(ARK_DATA_PATH, {
    ...creationConfig,
    mnemonic,
  });

  await Keychain.setGenericPassword(USERNAME, mnemonic, {
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  const mnemonicFilePath = `${ARK_DATA_PATH}/mnemonic`;
  const fileExists = await RNFS.exists(mnemonicFilePath);

  console.log("mnemonic file exists, deleting....");
  if (fileExists) {
    await RNFS.unlink(mnemonicFilePath);
  }
};

export const fetchBalance = async (sync: boolean) => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    // This is not an error, it just means the wallet is not created yet.
    return null;
  }
  const { password: mnemonic } = credentials;
  const newBalance = await getBalanceNitro(ARK_DATA_PATH, mnemonic, sync);
  return newBalance;
};

export const deleteWallet = async () => {
  try {
    const dataDirExists = await RNFS.exists(ARK_DATA_PATH);
    if (dataDirExists) {
      await RNFS.unlink(ARK_DATA_PATH);
    }

    await Keychain.resetGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE });
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    throw new Error(
      `Failed to delete wallet: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
