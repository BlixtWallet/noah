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
  type LightningPaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
  boardAllArk,
  offboardAllArk,
} from "../lib/paymentsApi";
import { type DestinationTypes } from "~/lib/sendUtils";
import { queryClient } from "~/queryClient";

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
  comment: string | null;
};

type SendResult =
  | ArkoorPaymentResult
  | LightningPaymentResult
  | LnurlPaymentResult
  | OnchainPaymentResult;

export function useSend(destinationType: DestinationTypes) {
  const { showAlert } = useAlert();

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
          result = await sendLnaddr(destination, amountSat, comment || "");
          break;
        default:
          throw new Error("Invalid destination type");
      }

      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Send Failed", description: error.message });
    },
  });
}
