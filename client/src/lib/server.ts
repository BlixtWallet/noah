import { registerWithServer } from "~/lib/api";
import * as Device from "expo-device";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";
import { type Result, err } from "neverthrow";
import { RegisterResponse } from "~/types/serverTypes";
import Constants from "expo-constants";
import { peakAddress } from "~/lib/paymentsApi";
import { performAttestation } from "~/hooks/useAppAttestation";

const log = logger("server");

export const performServerRegistration = async (
  ln_address: string | null,
): Promise<Result<RegisterResponse, Error>> => {
  const { setRegisteredWithServer } = useServerStore.getState();

  const addressResult = await peakAddress(0);
  if (addressResult.isErr()) {
    log.e("Failed to generate Ark address for registration", [addressResult.error]);
    return err(addressResult.error);
  }
  const ark_address = addressResult.value.address;

  // Attempt attestation (fails silently on error or unsupported devices)
  const attestationResult = await performAttestation();
  const { ios_attestation, android_attestation } = attestationResult.isOk()
    ? attestationResult.value
    : { ios_attestation: null, android_attestation: null };

  if (ios_attestation) {
    log.d("Including iOS attestation in registration");
  }
  if (android_attestation) {
    log.d("Including Android attestation in registration");
  }

  // Register with server and pass user device information.
  const result = await registerWithServer({
    device_info: {
      app_version: Constants.expoConfig?.version || null,
      os_name: Device.osName,
      os_version: Device.osVersion,
      device_model: Device.modelName,
      device_manufacturer: Device.manufacturer,
    },
    ln_address,
    ark_address,
    ios_attestation,
    android_attestation,
  });

  if (result.isErr()) {
    log.w("Failed to register with server", [result.error]);
    return result;
  }

  const { lightning_address } = result.value;
  log.d("Successfully registered with server");
  setRegisteredWithServer(true, lightning_address, true);
  return result;
};
