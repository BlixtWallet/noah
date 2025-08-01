import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAlert } from "~/contexts/AlertProvider";
import { useWalletStore } from "../store/walletStore";
import {
  createWallet as createWalletAction,
  fetchOnchainBalance,
  fetchOffchainBalance,
  deleteWallet as deleteWalletAction,
  loadWallet as loadWalletAction,
  sync as syncAction,
} from "../lib/walletApi";
import { closeWallet as closeWalletNitro } from "react-native-nitro-ark";
import type { OnboardingStackParamList } from "../Navigators";

export function useCreateWallet() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: createWalletAction,
    onSuccess: () => {
      navigation.navigate("Mnemonic", { fromOnboarding: true });
    },
    onError: async (error: Error) => {
      await deleteWalletAction();
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
    queryFn: async () => {
      const [onchain, offchain] = await Promise.all([
        fetchOnchainBalance(),
        fetchOffchainBalance(),
      ]);
      return { onchain, offchain };
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

export function useSync() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: syncAction,
    onError: (error: Error) => {
      showAlert({ title: "Failed to sync wallet", description: error.message });
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
