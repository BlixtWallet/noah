import {
  getVtxoPubkey as getVtxoPubkeyNitro,
  getOnchainAddress as getOnchainAddressNitro,
  boardAmount as boardAmountNitro,
  send as sendNitro,
  bolt11Invoice,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import { APP_VARIANT } from "../config";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;

export const getMnemonic = async (): Promise<string> => {
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
    const pubkey = await getVtxoPubkeyNitro();
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
    const address = await getOnchainAddressNitro();
    return address;
  } catch (error) {
    console.error("Failed to generate onchain address:", error);
    throw new Error(
      `Failed to generate onchain address: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const generateLightningInvoice = async (amountSat: number): Promise<string> => {
  try {
    const invoice = await bolt11Invoice(amountSat);
    return invoice;
  } catch (error) {
    console.error("Failed to generate lightning invoice:", error);
    throw new Error(
      `Failed to generate lightning invoice: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const boardArk = async (amountSat: number, noSync = false): Promise<string> => {
  try {
    // The last parameter `no_sync` is set to false to ensure the wallet syncs after boarding.
    const txid = await boardAmountNitro(amountSat, noSync);
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
  noSync = false,
}: {
  destination: string;
  amountSat: number;
  comment: string | null;
  noSync?: boolean;
}): Promise<string> => {
  try {
    // The last parameter `no_sync` is set to false to ensure the wallet syncs after sending.
    const result = await sendNitro(destination, amountSat, comment, noSync);
    return result;
  } catch (error) {
    console.error("Failed to send funds:", error);
    throw new Error(
      `Failed to send funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
