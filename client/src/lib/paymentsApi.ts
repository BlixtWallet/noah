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
  KeyPairResult,
} from "react-native-nitro-ark";
import * as Keychain from "react-native-keychain";
import { APP_VARIANT } from "../config";
import { captureException } from "@sentry/react-native";
import { err, ok, Result } from "neverthrow";

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

export const getMnemonic = async (): Promise<Result<string, Error>> => {
  const credentials = await Keychain.getGenericPassword({
    service: MNEMONIC_KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    return err(new Error("Mnemonic not found. Is the wallet initialized?"));
  }
  return ok(credentials.password);
};

export const newAddress = async (): Promise<Result<NewAddressResult, Error>> => {
  try {
    const address = await newAddressNitro();
    return ok(address);
  } catch (error) {
    console.error("Failed to generate VTXO pubkey:", error);
    return err(
      new Error(
        `Failed to generate VTXO pubkey: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const peakKeyPair = async (index: number): Promise<Result<KeyPairResult, Error>> => {
  try {
    const keypair = await peakKeyPairNitro(index);
    return ok(keypair);
  } catch (error) {
    console.error("Failed to peak keypair:", error);
    return err(
      new Error(
        `Failed to peak keypair: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const deriveStoreNextKeypair = async (): Promise<Result<KeyPairResult, Error>> => {
  try {
    const keypair = await deriveStoreNextKeypairNitro();
    return ok(keypair);
  } catch (error) {
    console.error("Failed to derive next keypair:", error);
    return err(
      new Error(
        `Failed to derive next keypair: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const onchainAddress = async (): Promise<Result<string, Error>> => {
  try {
    const address = await onchainAddressNitro();
    return ok(address);
  } catch (error) {
    console.error("Failed to generate onchain address:", error);
    return err(
      new Error(
        `Failed to generate onchain address: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const bolt11Invoice = async (amountSat: number): Promise<Result<string, Error>> => {
  try {
    const invoice = await bolt11InvoiceNitro(amountSat);
    return ok(invoice);
  } catch (error) {
    console.error("Failed to generate lightning invoice:", error);
    return err(
      new Error(
        `Failed to generate lightning invoice: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const boardArk = async (amountSat: number): Promise<Result<string, Error>> => {
  try {
    const txid = await boardAmountNitro(amountSat);
    return ok(txid);
  } catch (error) {
    console.error("Failed to board funds:", error);
    const e = new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return err(e);
  }
};

export const sendArkoorPayment = async (
  destination: string,
  amountSat: number,
): Promise<Result<ArkoorPaymentResult, Error>> => {
  try {
    const result = await sendArkoorPaymentNitro(destination, amountSat);
    return ok(result);
  } catch (error) {
    console.error("Failed to send arkoor payment:", error);
    const e = new Error(
      `Failed to send arkoor payment: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return err(e);
  }
};

export const sendLightningPayment = async (
  destination: string,
  amountSat: number | undefined,
): Promise<Result<LightningPaymentResult, Error>> => {
  try {
    const result = await sendLightningPaymentNitro(destination, amountSat);
    return ok(result);
  } catch (error) {
    console.error("Failed to send bolt11 payment:", error);
    const e = new Error(
      `Failed to send bolt11 payment: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return err(e);
  }
};

export const onchainSend = async ({
  destination,
  amountSat,
}: {
  destination: string;
  amountSat: number;
}): Promise<Result<OnchainPaymentResult, Error>> => {
  try {
    const result = await onchainSendNitro(destination, amountSat);
    return ok(result);
  } catch (error) {
    const e = new Error(
      `Failed to send onchain funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return err(e);
  }
};

export const sendLnaddr = async (
  addr: string,
  amountSat: number,
  comment: string,
): Promise<Result<LnurlPaymentResult, Error>> => {
  try {
    const result = await sendLnaddrNitro(addr, amountSat, comment);
    return ok(result);
  } catch (error) {
    console.error("Failed to send to lightning address:", error);
    const e = new Error(
      `Failed to send to lightning address: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    captureException(e);
    return err(e);
  }
};
