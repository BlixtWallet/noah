import { useMutation } from "@tanstack/react-query";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair } from "~/lib/paymentsApi";
import { signMessage } from "~/lib/walletApi";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";
import { isValidEmail } from "~/lib/utils";
import { Alert } from "react-native";

const log = logger("useUpdateLightningAddress");

const updateLightningAddress = async (newAddress: string) => {
  if (!isValidEmail(newAddress)) {
    throw new Error("Invalid lightning address format");
  }

  const serverEndpoint = getServerEndpoint();
  const getK1Url = `${serverEndpoint}/v0/getk1`;
  const response = await fetch(getK1Url);
  const { k1, tag } = await response.json();

  if (tag !== "login") {
    throw new Error("Invalid tag from server");
  }

  const index = 0;
  const { public_key: key } = await peakKeyPair(index);
  const sig = await signMessage(k1, index);

  const updateUrl = `${serverEndpoint}/v0/update_ln_address`;
  const updateResponse = await fetch(updateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      k1,
      sig,
      key,
      ln_address: newAddress,
    }),
  });

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    log.w("Failed to update lightning address", [updateResponse.status, errorBody]);
    throw new Error(`Failed to update lightning address. Server responded with: ${errorBody}`);
  }

  return newAddress;
};

export const useUpdateLightningAddress = (callbacks?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  const { setLightningAddress } = useServerStore();

  return useMutation({
    mutationFn: updateLightningAddress,
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
