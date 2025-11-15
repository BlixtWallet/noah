import { useEffect } from "react";
import {
  registerForPushNotificationsAsync,
  registerPushTokenWithServer,
  checkGooglePlayServices,
} from "~/lib/pushNotifications";
import { useServerStore } from "~/store/serverStore";
import logger from "~/lib/log";
import { loadWalletIfNeeded } from "~/lib/walletApi";
import { BackupService } from "~/lib/backupService";
import { UnifiedPushManager } from "~/lib/unifiedPush";

const log = logger("usePushNotifications");

export const usePushNotifications = (isReady: boolean) => {
  const { isRegisteredWithServer, isBackupEnabled } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || !isRegisteredWithServer) {
        return;
      }

      await loadWalletIfNeeded();

      // Check for Google Play Services availability on Android
      const hasPlayServices = checkGooglePlayServices();
      log.i("Google Play Services available", [hasPlayServices]);
      if (!hasPlayServices) {
        log.i("Google Play Services not available - checking for UnifiedPush endpoint");

        // Try to get saved UnifiedPush endpoint
        const manager = UnifiedPushManager.getInstance();
        const endpointResult = await manager.getEndpoint();

        if (endpointResult.isOk() && endpointResult.value && endpointResult.value !== "") {
          log.i("Found saved UnifiedPush endpoint, registering with server");
          const registerResult = await registerPushTokenWithServer(endpointResult.value);

          if (registerResult.isErr()) {
            log.w("Failed to register UnifiedPush endpoint with server", [registerResult.error]);
            return;
          }

          log.d("Successfully registered UnifiedPush endpoint with server");

          // If backup is enabled, register with server for backup
          if (isBackupEnabled) {
            const backupService = new BackupService();
            backupService.registerBackup();
          }
        } else {
          log.i("No UnifiedPush endpoint saved - user needs to configure UnifiedPush manually");
        }
        return;
      }

      const tokenResult = await registerForPushNotificationsAsync();
      if (tokenResult.isErr()) {
        if (tokenResult.error.message === "GOOGLE_PLAY_SERVICES_UNAVAILABLE") {
          log.i("Google Play Services unavailable - user needs UnifiedPush", [tokenResult.error]);
        } else {
          log.w("Failed to register for push notifications", [tokenResult.error]);
        }
        return;
      }

      const registerResult = await registerPushTokenWithServer(tokenResult.value);
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
