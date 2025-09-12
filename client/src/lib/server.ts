import { registerWithServer } from "~/lib/api";
import * as Device from "expo-device";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";
import type { Result } from "neverthrow";
import { RegisterResponse } from "~/types/serverTypes";

const log = logger("server");

export const performServerRegistration = async (
  ln_address: string | null,
): Promise<Result<RegisterResponse, Error>> => {
  const { setRegisteredWithServer } = useServerStore.getState();

  // Register with server and pass user device information.
  const result = await registerWithServer({
    device_info: {
      app_version: null,
      os_name: Device.osName,
      os_version: Device.osVersion,
      device_model: Device.modelName,
      device_manufacturer: Device.manufacturer,
    },
    ln_address,
  });

  if (result.isErr()) {
    log.w("Failed to register with server", [result.error]);
    return result;
  }

  const { lightning_address } = result.value;
  log.d("Successfully registered with server");
  setRegisteredWithServer(true, lightning_address);
  return result;
};
