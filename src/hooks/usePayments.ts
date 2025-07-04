import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "~/contexts/AlertProvider";
import {
  generateVtxoPubkey,
  generateOnchainAddress,
  boardArk,
  send,
  generateLightningInvoice,
  sendOnchain,
} from "../lib/paymentsApi";
import { DestinationTypes } from "~/lib/sendUtils";

export function useGenerateVtxoPubkey() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: generateVtxoPubkey,
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

export function useSend(destinationType: DestinationTypes) {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: destinationType === "onchain" ? sendOnchain : send,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      showAlert({ title: "Send Failed", description: error.message });
    },
  });
}
