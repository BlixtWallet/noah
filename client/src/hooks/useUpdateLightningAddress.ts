import { useMutation } from "@tanstack/react-query";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair } from "~/lib/paymentsApi";
import { signMessage } from "~/lib/walletApi";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";
import { isValidEmail } from "~/lib/utils";
import { Alert } from "react-native";
import { ResultAsync } from "neverthrow";

const log = logger("useUpdateLightningAddress");

const updateLightningAddress = async (newAddress: string) => {
  if (!isValidEmail(newAddress)) {
    throw new Error("Invalid lightning address format");
  }

  const serverEndpoint = getServerEndpoint();
  const getK1Url = `${serverEndpoint}/v0/getk1`;

  const k1Result = await ResultAsync.fromPromise(
    fetch(getK1Url).then((res) => res.json()),
    (e) => e as Error,
  );

  if (k1Result.isErr()) {
    throw k1Result.error;
  }

  const { k1, tag } = k1Result.value;

  if (tag !== "login") {
    throw new Error("Invalid tag from server");
  }

  const index = 0;
  const peakResult = await peakKeyPair(index);
  if (peakResult.isErr()) {
    throw peakResult.error;
  }
  const { public_key: key } = peakResult.value;

  const sigResult = await signMessage(k1, index);
  if (sigResult.isErr()) {
    throw sigResult.error;
  }
  const sig = sigResult.value;

  const updateUrl = `${serverEndpoint}/v0/update_ln_address`;
  const updateResponseResult = await ResultAsync.fromPromise(
    fetch(updateUrl, {
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
    }),
    (e) => e as Error,
  );

  if (updateResponseResult.isErr()) {
    throw updateResponseResult.error;
  }

  const updateResponse = updateResponseResult.value;

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
