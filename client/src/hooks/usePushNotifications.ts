import { useEffect } from "react";
import {
  registerForPushNotificationsAsync,
  registerPushTokenWithServer,
} from "~/lib/pushNotifications";
import { useServerStore } from "~/store/serverStore";
import logger from "~/lib/log";
import { loadWalletIfNeeded } from "~/lib/walletApi";
import { BackupService } from "~/lib/backupService";

const log = logger("usePushNotifications");

export const usePushNotifications = (isReady: boolean) => {
  const { isRegisteredWithServer, isBackupEnabled } = useServerStore();

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

      const tokenPayload = tokenResult.value;
      if (tokenPayload.kind !== "success") {
        log.w("Push permission not granted or device unsupported", [tokenPayload.kind]);
        return;
      }

      const registerResult = await registerPushTokenWithServer(tokenPayload.pushToken);
      if (registerResult.isErr()) {
        log.w("Failed to register push token with server", [registerResult.error]);
        return;
      }

      log.d("Successfully registered for push notifications");

      // If backup is enabled, then register with server for backup
      log.d("Is backup enabled?", [isBackupEnabled]);
      if (isBackupEnabled) {
        const backupService = new BackupService();
        backupService.registerBackup();
      }
    };

    register();
  }, [isRegisteredWithServer, isReady]);
};
