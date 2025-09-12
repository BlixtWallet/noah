import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { performServerRegistration } from "~/lib/server";

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer) {
        return;
      }

      await performServerRegistration(null);
    };

    register();
  }, [isRegisteredWithServer, isReady]);
};
