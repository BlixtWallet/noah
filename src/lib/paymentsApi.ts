import {
  boardAmount as boardAmountNitro,
  sendArkoorPayment as sendArkoorPaymentNitro,
  sendLnaddr as sendLnaddrNitro,
  bolt11Invoice as bolt11InvoiceNitro,
  type ArkoorPaymentResult,
  type OnchainPaymentResult,
  type LightningPaymentResult,
  type LnurlPaymentResult,
  newAddress as newAddressNitro,
  onchainAddress as onchainAddressNitro,
  sendLightningPayment as sendLightningPaymentNitro,
  onchainSend as onchainSendNitro,
  peakKeyPair as peakKeyPairNitro,
  deriveStoreNextKeypair as deriveStoreNextKeypairNitro,
  NewAddressResult,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import { APP_VARIANT } from "../config";
import { captureException } from "@sentry/react-native";

export type {
  ArkoorPaymentResult,
  OnchainPaymentResult,
  LightningPaymentResult,
  LnurlPaymentResult,
};

export type PaymentResult =
  | ArkoorPaymentResult
  | OnchainPaymentResult
  | LightningPaymentResult
  | LnurlPaymentResult;

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

export const newAddress = async (): Promise<NewAddressResult> => {
  try {
    const address = await newAddressNitro();
    return address;
  } catch (error) {
    console.error("Failed to generate VTXO pubkey:", error);
    throw new Error(
      `Failed to generate VTXO pubkey: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const peakKeyPair = async (index: number): Promise<string> => {
  try {
    const keypair = await peakKeyPairNitro(index);
    return keypair;
  } catch (error) {
    console.error("Failed to peak keypair:", error);
    throw new Error(
      `Failed to peak keypair: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const deriveStoreNextKeypair = async (): Promise<string> => {
  try {
    const keypair = await deriveStoreNextKeypairNitro();
    return keypair;
  } catch (error) {
    console.error("Failed to derive next keypair:", error);
    throw new Error(
      `Failed to derive next keypair: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const onchainAddress = async (): Promise<string> => {
  try {
    const address = await onchainAddressNitro();
    return address;
  } catch (error) {
    console.error("Failed to generate onchain address:", error);
    throw new Error(
      `Failed to generate onchain address: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const bolt11Invoice = async (amountSat: number): Promise<string> => {
  try {
    const invoice = await bolt11InvoiceNitro(amountSat);
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
    captureException(
      new Error(`Failed to board funds: ${error instanceof Error ? error.message : String(error)}`),
    );
    throw new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendArkoorPayment = async (
  destination: string,
  amountSat: number,
): Promise<ArkoorPaymentResult> => {
  try {
    const result = await sendArkoorPaymentNitro(destination, amountSat);
    return result;
  } catch (error) {
    console.error("Failed to send arkoor payment:", error);
    captureException(
      new Error(
        `Failed to send arkoor payment: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw new Error(
      `Failed to send arkoor payment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendLightningPayment = async (
  destination: string,
  amountSat: number | undefined,
): Promise<LightningPaymentResult> => {
  try {
    const result = await sendLightningPaymentNitro(destination, amountSat);
    return result;
  } catch (error) {
    console.error("Failed to send bolt11 payment:", error);
    captureException(
      new Error(
        `Failed to send bolt11 payment: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw new Error(
      `Failed to send bolt11 payment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const onchainSend = async ({
  destination,
  amountSat,
}: {
  destination: string;
  amountSat: number;
}): Promise<OnchainPaymentResult> => {
  try {
    const result = await onchainSendNitro(destination, amountSat);
    console.log("Onchain send result:", result);
    return result;
  } catch (error) {
    console.error("Failed to send onchain funds:", error);
    captureException(
      new Error(
        `Failed to send onchain funds: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw new Error(
      `Failed to send onchain funds: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const sendLnaddr = async (
  addr: string,
  amountSat: number,
  comment: string,
): Promise<LnurlPaymentResult> => {
  try {
    const result = await sendLnaddrNitro(addr, amountSat, comment);
    return result;
  } catch (error) {
    console.error("Failed to send to lightning address:", error);
    captureException(
      new Error(
        `Failed to send to lightning address: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw new Error(
      `Failed to send to lightning address: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
