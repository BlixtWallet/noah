import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useWalletStore } from "../store/walletStore";
import {
  createWallet as createWalletAction,
  fetchBalance as fetchBalanceAction,
  deleteWallet as deleteWalletAction,
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
    queryFn: () => fetchBalanceAction(false),
    enabled: isInitialized,
    retry: false,
  });
}

export function useDeleteWallet() {
  const { reset } = useWalletStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWalletAction,
    onSuccess: () => {
      reset();
      queryClient.clear();
    },
    onError: (error: Error) => {
      Alert.alert("Deletion Failed", error.message);
    },
  });
}
