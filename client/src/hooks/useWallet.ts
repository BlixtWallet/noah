import { useMutation, useQuery } from "@tanstack/react-query";
import { useAlert } from "~/contexts/AlertProvider";
import { useServerStore } from "../store/serverStore";
import { useWalletStore } from "../store/walletStore";
import {
  createWallet as createWalletAction,
  fetchOnchainBalance,
  fetchOffchainBalance,
  deleteWallet as deleteWalletAction,
  loadWalletIfNeeded as loadWalletAction,
  sync as syncAction,
  onchainSync as onchainSyncAction,
} from "../lib/walletApi";
import { closeWallet as closeWalletNitro } from "react-native-nitro-ark";
import { queryClient } from "~/queryClient";

export function useCreateWallet() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await createWalletAction();
      if (result.isErr()) {
        throw result.error;
      }
    },
    onError: async (error: Error) => {
      await deleteWalletAction();
      showAlert({ title: "Creation Failed", description: error.message });
    },
  });
}

export function useLoadWallet() {
  const { setWalletLoaded, setWalletError } = useWalletStore();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await loadWalletAction();
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (walletExists) => {
      if (walletExists) {
        setWalletLoaded();
      }
    },
    onError: (error: Error) => {
      setWalletError(true);
      showAlert({ title: "Failed to load wallet", description: error.message });
    },
  });
}

export function useBalance() {
  const { isInitialized } = useWalletStore();

  return useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const [onchainResult, offchainResult] = await Promise.all([
        fetchOnchainBalance(),
        fetchOffchainBalance(),
      ]);

      if (onchainResult.isErr()) {
        throw onchainResult.error;
      }
      if (offchainResult.isErr()) {
        throw offchainResult.error;
      }

      return { onchain: onchainResult.value, offchain: offchainResult.value };
    },
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

export const useBalanceSync = () => {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([syncAction(), onchainSyncAction()]);
      results.forEach((result) => {
        if (result.status === "rejected") {
          throw result.reason;
        }
      });
    },
    onError: (error: Error) => {
      showAlert({ title: "Failed to sync wallet balance", description: error.message });
    },
  });
};

export function useOffchainSync() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await syncAction();
      if (result.isErr()) {
        throw result.error;
      }
    },
    onError: (error: Error) => {
      showAlert({ title: "Failed to sync wallet", description: error.message });
    },
  });
}

export function useOnchainSync() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await onchainSyncAction();
      if (result.isErr()) {
        throw result.error;
      }
    },
    onError: (error: Error) => {
      showAlert({ title: "Failed to sync wallet", description: error.message });
    },
  });
}

export function useDeleteWallet() {
  const { reset } = useWalletStore();
  const { resetRegistration } = useServerStore();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async () => {
      const result = await deleteWalletAction();
      if (result.isErr()) {
        throw result.error;
      }
    },
    onSuccess: () => {
      reset();
      resetRegistration();
      queryClient.clear();
    },
    onError: (error: Error) => {
      showAlert({ title: "Deletion Failed", description: error.message });
    },
  });
}
