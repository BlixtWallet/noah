import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useWalletStore } from "../store/walletStore";
import {
  createWallet as createWalletAction,
  fetchBalance as fetchBalanceAction,
} from "../lib/walletApi";

export function useCreateWallet() {
  const { finishOnboarding } = useWalletStore();

  return useMutation({
    mutationFn: createWalletAction,
    onSuccess: () => {
      finishOnboarding();
    },
    onError: (error: Error) => {
      Alert.alert("Creation Failed", error.message);
    },
  });
}

export function useBalance() {
  const { isInitialized } = useWalletStore();

  return useQuery({
    queryKey: ["balance"],
    queryFn: () => fetchBalanceAction(true),
    enabled: isInitialized,
    retry: false,
  });
}
