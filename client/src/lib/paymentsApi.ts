import {
  boardAmount as boardAmountNitro,
  boardAll as boardAllNitro,
  offboardAll as offboardAllNitro,
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
  NewAddressResult,
} from "react-native-nitro-ark";
import { captureException } from "@sentry/react-native";
import { Result, ResultAsync } from "neverthrow";

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

export const newAddress = async (): Promise<Result<NewAddressResult, Error>> => {
  return ResultAsync.fromPromise(
    newAddressNitro(),
    (error) =>
      new Error(
        `Failed to generate VTXO pubkey: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
};

export const onchainAddress = async (): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(
    onchainAddressNitro(),
    (error) =>
      new Error(
        `Failed to generate onchain address: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
};

export const bolt11Invoice = async (amountSat: number): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(
    bolt11InvoiceNitro(amountSat),
    (error) =>
      new Error(
        `Failed to generate lightning invoice: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
};

export const boardArk = async (amountSat: number): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(boardAmountNitro(amountSat), (error) => {
    const e = new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const boardAllArk = async (): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(boardAllNitro(), (error) => {
    const e = new Error(
      `Failed to board funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const offboardAllArk = async (address: string): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(offboardAllNitro(address), (error) => {
    const e = new Error(
      `Failed to offboard funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const sendArkoorPayment = async (
  destination: string,
  amountSat: number,
): Promise<Result<ArkoorPaymentResult, Error>> => {
  return ResultAsync.fromPromise(sendArkoorPaymentNitro(destination, amountSat), (error) => {
    const e = new Error(
      `Failed to send arkoor payment: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const sendLightningPayment = async (
  destination: string,
  amountSat: number | undefined,
): Promise<Result<LightningPaymentResult, Error>> => {
  return ResultAsync.fromPromise(sendLightningPaymentNitro(destination, amountSat), (error) => {
    const e = new Error(
      `Failed to send bolt11 payment: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const onchainSend = async ({
  destination,
  amountSat,
}: {
  destination: string;
  amountSat: number;
}): Promise<Result<OnchainPaymentResult, Error>> => {
  return ResultAsync.fromPromise(onchainSendNitro(destination, amountSat), (error) => {
    const e = new Error(
      `Failed to send onchain funds: ${error instanceof Error ? error.message : String(error)}`,
    );
    captureException(e);
    return e;
  });
};

export const sendLnaddr = async (
  addr: string,
  amountSat: number,
  comment: string,
): Promise<Result<LnurlPaymentResult, Error>> => {
  return ResultAsync.fromPromise(sendLnaddrNitro(addr, amountSat, comment), (error) => {
    const e = new Error(
      `Failed to send to lightning address: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    captureException(e);
    return e;
  });
};
