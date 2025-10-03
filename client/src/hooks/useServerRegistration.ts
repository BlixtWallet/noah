import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { performServerRegistration } from "~/lib/server";
import { useAppVersionCheck } from "./useAppVersionCheck";

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer } = useServerStore();
  const { isChecking } = useAppVersionCheck();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer || isChecking) {
        return;
      }

      await performServerRegistration(null);
    };

    register();
  }, [isRegisteredWithServer, isReady, isChecking]);

  return {
    isChecking,
  };
};
