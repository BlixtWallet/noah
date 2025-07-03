import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import {
  generateVtxoPubkey,
  generateOnchainAddress,
  boardArk,
  send,
  generateLightningInvoice,
} from "../lib/paymentsApi";

export function useGenerateVtxoPubkey() {
  return useMutation({
    mutationFn: generateVtxoPubkey,
    onError: (error: Error) => {
      Alert.alert("Vtxo Pubkey Generation Failed", error.message);
    },
  });
}

export function useGenerateOnchainAddress() {
  return useMutation({
    mutationFn: generateOnchainAddress,
    onError: (error: Error) => {
      Alert.alert("On-chain Address Generation Failed", error.message);
    },
  });
}

export function useGenerateLightningInvoice() {
  return useMutation({
    mutationFn: generateLightningInvoice,
    onError: (error: Error) => {
      Alert.alert("Lightning Invoice Generation Failed", error.message);
    },
  });
}

export function useBoardArk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: boardArk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      Alert.alert("Boarding Failed", error.message);
    },
  });
}

export function useSend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error: Error) => {
      Alert.alert("Send Failed", error.message);
    },
  });
}
