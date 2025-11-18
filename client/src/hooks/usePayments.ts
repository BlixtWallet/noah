import { useMutation } from "@tanstack/react-query";
import { useAlert } from "~/contexts/AlertProvider";
import {
  newAddress,
  onchainAddress,
  boardArk,
  bolt11Invoice,
  onchainSend,
  sendArkoorPayment,
  sendLightningPayment,
  sendLnaddr,
  type ArkoorPaymentResult,
  type Bolt11PaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
  boardAllArk,
  offboardAllArk,
  checkAndClaimLnReceive,
} from "../lib/paymentsApi";
import { queryClient } from "~/queryClient";
import { Transaction, PaymentTypes } from "~/types/transaction";
import uuid from "react-native-uuid";
import { DestinationTypes } from "~/lib/sendUtils";
import logger from "~/lib/log";
import { useTransactionStore } from "~/store/transactionStore";

const log = logger("usePayments");

export function useGenerateOffchainAddress() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await newAddress();
      if (result.isErr()) {
        throw result.error;
      }
      return result.value.address;
    },
    onError: (error: Error) => {
      showAlert({ title: "Vtxo Pubkey Generation Failed", description: error.message });
    },
  });
}

export function useGenerateOnchainAddress() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await onchainAddress();
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onError: (error: Error) => {
      showAlert({ title: "On-chain Address Generation Failed", description: error.message });
    },
  });
}

export function useGenerateLightningInvoice() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (amount: number) => {
      const result = await bolt11Invoice(amount);
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onError: (error: Error) => {
      showAlert({ title: "Lightning Invoice Generation Failed", description: error.message });
    },
  });
}

export function useBoardArk() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (amount: number) => {
      const result = await boardArk(amount);
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Boarding Failed", description: error.message });
    },
  });
}

export function useBoardAllAmountArk() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await boardAllArk();
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Boarding Failed", description: error.message });
    },
  });
}

export function useOffboardAllArk() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (address: string) => {
      const result = await offboardAllArk(address);
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Offboarding Failed", description: error.message });
    },
  });
}

type SendVariables = {
  destination: string;
  amountSat: number | undefined;
  resolvedAmountSat: number;
  comment: string | null;
  btcPrice?: number;
};

type SendResult =
  | ArkoorPaymentResult
  | Bolt11PaymentResult
  | LnurlPaymentResult
  | OnchainPaymentResult;

const mapDestinationToPaymentType = (destinationType: DestinationTypes): PaymentTypes | null => {
  switch (destinationType) {
    case "ark":
      return "Arkoor";
    case "lightning":
      return "Bolt11";
    case "lnurl":
      return "Lnurl";
    case "onchain":
      return "Onchain";
    default:
      return null;
  }
};

export function useSend(destinationType: DestinationTypes) {
  const { showAlert } = useAlert();
  const addTransaction = useTransactionStore((state) => state.addTransaction);

  return useMutation<SendResult, Error, SendVariables>({
    mutationFn: async (variables) => {
      const { destination, amountSat, comment } = variables;
      if (amountSat === undefined && destinationType !== "lightning") {
        throw new Error("Amount is required");
      }

      let result;
      switch (destinationType) {
        case "onchain":
          if (amountSat === undefined) {
            throw new Error("Amount is required for onchain payments");
          }
          result = await onchainSend({ destination, amountSat });
          break;
        case "ark":
          if (amountSat === undefined) {
            throw new Error("Amount is required for Ark payments");
          }
          result = await sendArkoorPayment(destination, amountSat);
          break;
        case "lightning":
          result = await sendLightningPayment(destination, amountSat);
          break;
        case "lnurl":
          if (amountSat === undefined) {
            throw new Error("Amount is required for LNURL payments");
          }

          if (destination.toLowerCase().endsWith("noahwallet.io")) {
            try {
              const [user, domain] = destination.split("@");
              const lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${user}`;
              const lnurlResp = await fetch(lnurlEndpoint);
              const lnurlJson = await lnurlResp.json();

              if (lnurlJson.tag === "payRequest" && lnurlJson.callback) {
                const callbackUrl = new URL(lnurlJson.callback);
                callbackUrl.searchParams.append("amount", (amountSat * 1000).toString());
                callbackUrl.searchParams.append("wallet", "noahwallet");
                // If comment is supported/provided, it should be added too, but ignoring for now for simplicity or adding if needed.
                if (comment) {
                   callbackUrl.searchParams.append("comment", comment);
                }

                const callbackResp = await fetch(callbackUrl.toString());
                const callbackJson = await callbackResp.json();

                if (callbackJson.ark) {
                  log.d("Paying via Ark direct payment");
                  result = await sendArkoorPayment(callbackJson.ark, amountSat);
                } else if (callbackJson.pr) {
                  log.d("Paying via Lightning Invoice from LNURL");
                  result = await sendLightningPayment(callbackJson.pr, amountSat);
                } else {
                  throw new Error("Invalid LNURL callback response");
                }
              } else {
                 result = await sendLnaddr(destination, amountSat, comment || "");
              }
            } catch (e) {
              log.w("Failed optimized Noah payment, falling back to standard LNURL", [e]);
              result = await sendLnaddr(destination, amountSat, comment || "");
            }
          } else {
            result = await sendLnaddr(destination, amountSat, comment || "");
          }
          break;
        default:
          throw new Error("Invalid destination type");
      }

      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      const paymentType = mapDestinationToPaymentType(destinationType);

      if (paymentType) {
        const { destination, amountSat, resolvedAmountSat, comment, btcPrice } = variables;
        const transaction: Transaction = {
          id: uuid.v4().toString(),
          txid: "txid" in data ? (data.txid as string) : undefined,
          type: paymentType,
          direction: "outgoing",
          amount: amountSat ?? resolvedAmountSat,
          date: new Date().toISOString(),
          destination: destination,
          preimage: "preimage" in data ? (data.preimage as string) : undefined,
          description: comment || undefined,
          btcPrice,
        };
        addTransaction(transaction).catch((error) => {
          log.w("Failed to persist transaction to store", [error]);
        });
      }
    },
    onError: (error: Error) => {
      showAlert({ title: "Send Failed", description: error.message });
    },
  });
}

export function useCheckAndClaimLnReceive() {
  return useMutation({
    mutationFn: async ({ paymentHash, amountSat }: { paymentHash: string; amountSat: number }) => {
      const maxAttempts = 20;
      const intervalMs = 1000;

      for (let i = 0; i < maxAttempts; i++) {
        const result = await checkAndClaimLnReceive(paymentHash, false);

        log.d("Claim result", [result]);

        if (result.isOk()) {
          return { amountSat };
        }

        log.d(`Attempt ${i + 1}/${maxAttempts} failed:`, [result.error.message]);

        if (i < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }

      throw new Error(`Failed to claim lightning receive after ${maxAttempts} attempts`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      log.w("Failed to claim lightning receive:", [error.message]);
    },
  });
}
