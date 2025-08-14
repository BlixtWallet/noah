import { useEffect } from "react";
import {
  registerForPushNotificationsAsync,
  registerPushTokenWithServer,
} from "~/lib/pushNotifications";
import { useServerStore } from "~/store/serverStore";
import logger from "~/lib/log";

const log = logger("usePushNotifications");

export const usePushNotifications = () => {
  const { isRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      // if (!isRegisteredWithServer) {
      //   log.d("Not registered with server, skipping push notification registration");
      //   return;
      // }

      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await registerPushTokenWithServer(token);
          log.d("Successfully registered for push notifications");
        }
      } catch (error) {
        log.w("Failed to register for push notifications", [error]);
      }
    };

    register();
  }, [isRegisteredWithServer]);
};
