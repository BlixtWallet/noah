import {
  getVtxoPubkey as getVtxoPubkeyNitro,
  getOnchainAddress as getOnchainAddressNitro,
  boardAmount as boardAmountNitro,
  send as sendNitro,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;

const getMnemonic = async (): Promise<string> => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    throw new Error("Mnemonic not found. Is the wallet initialized?");
  }
  return credentials.password;
};

export const generateVtxoPubkey = async (): Promise<string> => {
  try {
    const mnemonic = await getMnemonic();
    const pubkey = await getVtxoPubkeyNitro(ARK_DATA_PATH, mnemonic);
    return pubkey;
  } catch (error) {
    console.error("Failed to generate VTXO pubkey:", error);
    throw new Error(
      `Failed to generate VTXO pubkey: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const generateOnchainAddress = async (): Promise<string> => {
  try {
    const mnemonic = await getMnemonic();
    const address = await getOnchainAddressNitro(ARK_DATA_PATH, mnemonic);
    return address;
  } catch (error) {
    console.error("Failed to generate onchain address:", error);
    throw new Error(
      `Failed to generate onchain address: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const boardArk = async (amountSat: number): Promise<string> => {
  try {
    const mnemonic = await getMnemonic();
    // The last parameter `no_sync` is set to false to ensure the wallet syncs after boarding.
    const txid = await boardAmountNitro(ARK_DATA_PATH, mnemonic, amountSat, false);
    return txid;
  } catch (error) {
    console.error("Failed to board funds:", error);
    throw new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const send = async ({
  destination,
  amountSat,
  comment,
}: {
  destination: string;
  amountSat: number;
  comment: string | null;
}): Promise<string> => {
  try {
    const mnemonic = await getMnemonic();
    // The last parameter `no_sync` is set to false to ensure the wallet syncs after sending.
    const result = await sendNitro(ARK_DATA_PATH, mnemonic, destination, amountSat, comment, false);
    return result;
  } catch (error) {
    console.error("Failed to send funds:", error);
    throw new Error(
      `Failed to send funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
