import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { registerWithServer } from "~/lib/api";
import logger from "~/lib/log";

const log = logger("useServerRegistration");

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer, setRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer) {
        return;
      }

      const result = await registerWithServer();

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
