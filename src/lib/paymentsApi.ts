import {
  getVtxoPubkey as getVtxoPubkeyNitro,
  getOnchainAddress as getOnchainAddressNitro,
  boardAmount as boardAmountNitro,
  sendArkoorPayment as sendArkoorPaymentNitro,
  sendBolt11Payment as sendBolt11PaymentNitro,
  sendOnchain as sendOnchainNitro,
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

export const boardArk = async (amountSat: number): Promise<string> => {
  try {
    const txid = await boardAmountNitro(amountSat);
    return txid;
  } catch (error) {
    console.error("Failed to board funds:", error);
    throw new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendArkoorPayment = async (
  destination: string,
  amountSat: number,
): Promise<string> => {
  try {
    const result = await sendArkoorPaymentNitro(destination, amountSat);
    return result;
  } catch (error) {
    console.error("Failed to send arkoor payment:", error);
    throw new Error(
      `Failed to send arkoor payment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendBolt11Payment = async (
  destination: string,
  amountSat: number | undefined,
): Promise<string> => {
  try {
    const result = await sendBolt11PaymentNitro(destination, amountSat);
    return result;
  } catch (error) {
    console.error("Failed to send bolt11 payment:", error);
    throw new Error(
      `Failed to send bolt11 payment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendOnchain = async ({
  destination,
  amountSat,
}: {
  destination: string;
  amountSat: number;
}): Promise<string> => {
  try {
    const result = await sendOnchainNitro(destination, amountSat);
    console.log("Onchain send result:", result);
    return result;
  } catch (error) {
    console.error("Failed to send onchain funds:", error);
    throw new Error(
      `Failed to send onchain funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
