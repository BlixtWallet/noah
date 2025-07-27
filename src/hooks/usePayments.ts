import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "~/contexts/AlertProvider";
import {
  generateVtxoPubkey,
  generateOnchainAddress,
  boardArk,
  generateLightningInvoice,
  sendOnchain,
  sendArkoorPayment,
  sendBolt11Payment,
  sendLnaddr,
  type ArkoorPaymentResult,
  type Bolt11PaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
} from "../lib/paymentsApi";
import { type DestinationTypes } from "~/lib/sendUtils";

export function useGenerateVtxoPubkey() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (index?: number) => await generateVtxoPubkey(index),
    onError: (error: Error) => {
      showAlert({ title: "Vtxo Pubkey Generation Failed", description: error.message });
    },
  });
}

export function useGenerateOnchainAddress() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: generateOnchainAddress,
    onError: (error: Error) => {
      showAlert({ title: "On-chain Address Generation Failed", description: error.message });
    },
  });
}

export function useGenerateLightningInvoice() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: generateLightningInvoice,
    onError: (error: Error) => {
      showAlert({ title: "Lightning Invoice Generation Failed", description: error.message });
    },
  });
}

export function useBoardArk() {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: boardArk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Boarding Failed", description: error.message });
    },
  });
}

type SendVariables = {
  destination: string;
  amountSat: number | undefined;
  comment: string | null;
};

type SendResult =
  | ArkoorPaymentResult
  | Bolt11PaymentResult
  | LnurlPaymentResult
  | OnchainPaymentResult;

export function useSend(destinationType: DestinationTypes) {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();

  return useMutation<SendResult, Error, SendVariables>({
    mutationFn: (variables) => {
      const { destination, amountSat, comment } = variables;
      if (amountSat === undefined && destinationType !== "lightning") {
        return Promise.reject(new Error("Amount is required"));
      }

      switch (destinationType) {
        case "onchain":
          if (amountSat === undefined) {
            return Promise.reject(new Error("Amount is required for onchain payments"));
          }
          return sendOnchain({ destination, amountSat });
        case "ark":
          if (amountSat === undefined) {
            return Promise.reject(new Error("Amount is required for Ark payments"));
          }
          return sendArkoorPayment(destination, amountSat);
        case "lightning":
          return sendBolt11Payment(destination, amountSat);
        case "lnurl":
          if (amountSat === undefined) {
            return Promise.reject(new Error("Amount is required for LNURL payments"));
          }
          return sendLnaddr(destination, amountSat, comment || "");
        default:
          return Promise.reject(new Error("Invalid destination type"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Send Failed", description: error.message });
    },
  });
}
