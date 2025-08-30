import { useEffect } from "react";
import {
  registerForPushNotificationsAsync,
  registerPushTokenWithServer,
} from "~/lib/pushNotifications";
import { useServerStore } from "~/store/serverStore";
import logger from "~/lib/log";
import { loadWalletIfNeeded } from "~/lib/walletApi";

const log = logger("usePushNotifications");

export const usePushNotifications = (isReady: boolean) => {
  const { isRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || !isRegisteredWithServer) {
        return;
      }

      await loadWalletIfNeeded();

      const tokenResult = await registerForPushNotificationsAsync();
      if (tokenResult.isErr()) {
        log.w("Failed to register for push notifications", [tokenResult.error]);
        return;
      }

      const registerResult = await registerPushTokenWithServer(tokenResult.value);
      if (registerResult.isErr()) {
        log.w("Failed to register push token with server", [registerResult.error]);
        return;
      }

      log.d("Successfully registered for push notifications");
    };

    register();
  }, [isRegisteredWithServer, isReady]);
};
