import { useMutation } from "@tanstack/react-query";
import { updateLightningAddress } from "~/lib/api";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";
import { isValidEmail } from "~/lib/utils";
import { Alert } from "react-native";

const log = logger("useUpdateLightningAddress");

const updateLightningAddressWrapper = async (newAddress: string) => {
  if (!isValidEmail(newAddress)) {
    throw new Error("Invalid lightning address format");
  }

  const result = await updateLightningAddress({ ln_address: newAddress });

  if (result.isErr()) {
    throw result.error;
  }

  return newAddress;
};

export const useUpdateLightningAddress = (callbacks?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  const { setLightningAddress } = useServerStore();

  return useMutation({
    mutationFn: updateLightningAddressWrapper,
    onSuccess: (newAddress) => {
      setLightningAddress(newAddress);
      log.d("Successfully updated lightning address");
      callbacks?.onSuccess?.();
    },
    onError: (error: Error) => {
      log.w("Failed to update lightning address", [error]);
      callbacks?.onError?.(error);
      Alert.alert("Error", error.message);
    },
  });
};
