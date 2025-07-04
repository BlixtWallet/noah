import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "~/contexts/AlertProvider";
import { useWalletStore } from "../store/walletStore";
import {
  createWallet as createWalletAction,
  fetchBalance as fetchBalanceAction,
  deleteWallet as deleteWalletAction,
  loadWallet as loadWalletAction,
} from "../lib/walletApi";
import { closeWallet as closeWalletNitro } from "react-native-nitro-ark";

export function useCreateWallet() {
  const { finishOnboarding } = useWalletStore();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: createWalletAction,
    onSuccess: () => {
      finishOnboarding();
    },
    onError: (error: Error) => {
      showAlert({ title: "Creation Failed", description: error.message });
    },
  });
}

export function useLoadWallet() {
  const { setWalletLoaded } = useWalletStore();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: loadWalletAction,
    onSuccess: (walletExists) => {
      if (walletExists) {
        setWalletLoaded();
      }
    },
    onError: (error: Error) => {
      showAlert({ title: "Failed to load wallet", description: error.message });
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

export function useCloseWallet() {
  const { setWalletUnloaded } = useWalletStore();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: closeWalletNitro,
    onError: (error: Error) => {
      showAlert({ title: "Failed to close wallet", description: error.message });
    },
    onSuccess: () => {
      setWalletUnloaded();
    },
  });
}

export function useDeleteWallet() {
  const { reset } = useWalletStore();
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: deleteWalletAction,
    onSuccess: () => {
      reset();
      queryClient.clear();
    },
    onError: (error: Error) => {
      showAlert({ title: "Deletion Failed", description: error.message });
    },
  });
}
