import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  type LightningPaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
} from "../lib/paymentsApi";
import { type DestinationTypes } from "~/lib/sendUtils";

export function useGenerateOffchainAddress() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => (await newAddress()).address,
    onError: (error: Error) => {
      showAlert({ title: "Vtxo Pubkey Generation Failed", description: error.message });
    },
  });
}

export function useGenerateOnchainAddress() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: onchainAddress,
    onError: (error: Error) => {
      showAlert({ title: "On-chain Address Generation Failed", description: error.message });
    },
  });
}

export function useGenerateLightningInvoice() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: bolt11Invoice,
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
  | LightningPaymentResult
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
          return onchainSend({ destination, amountSat });
        case "ark":
          if (amountSat === undefined) {
            return Promise.reject(new Error("Amount is required for Ark payments"));
          }
          return sendArkoorPayment(destination, amountSat);
        case "lightning":
          return sendLightningPayment(destination, amountSat);
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
