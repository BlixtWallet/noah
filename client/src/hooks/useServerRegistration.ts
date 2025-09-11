import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { registerWithServer } from "~/lib/api";
import * as Device from "expo-device";
import logger from "~/lib/log";

const log = logger("useServerRegistration");

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer, setRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer) {
        return;
      }

      // Register with server and pass user device information.
      const result = await registerWithServer({
        device_info: {
          app_version: null,
          os_name: Device.osName,
          os_version: Device.osVersion,
          device_model: Device.modelName,
          device_manufacturer: Device.manufacturer,
        },
        ln_address: null,
      });

      if (result.isErr()) {
        log.w("Failed to register with server", [result.error]);
        return;
      }

      const { lightning_address } = result.value;
      log.d("Successfully registered with server");
      setRegisteredWithServer(true, lightning_address);
    };

    register();
  }, [isRegisteredWithServer, setRegisteredWithServer, isReady]);
};
