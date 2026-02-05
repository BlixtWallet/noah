import { useEffect } from "react";
import { triggerAutoBackup } from "~/lib/backupAuto";
import { useBackupStore } from "~/store/backupStore";
import { useServerStore } from "~/store/serverStore";
import { useWalletStore } from "~/store/walletStore";
import { useBackgroundJobCoordination } from "~/hooks/useBackgroundJobCoordination";
import { AUTO_BACKUP_FRESHNESS_MS } from "~/constants";

export const useAutoBackup = (isReady: boolean) => {
  const { safelyExecuteWhenReady } = useBackgroundJobCoordination();
  const { isBackupEnabled } = useServerStore();
  const { lastBackupAt, lastBackupStatus } = useBackupStore();
  const { isInitialized, isWalletSuspended } = useWalletStore();

  useEffect(() => {
    if (!isReady || !isInitialized || isWalletSuspended || !isBackupEnabled) {
      return;
    }

    const now = Date.now();
    const isFresh = lastBackupAt && now - lastBackupAt < AUTO_BACKUP_FRESHNESS_MS;
    if (lastBackupStatus === "in_progress" || isFresh) {
      return;
    }

    void safelyExecuteWhenReady(() => triggerAutoBackup("app_open"));
  }, [
    isReady,
    isInitialized,
    isWalletSuspended,
    isBackupEnabled,
    lastBackupAt,
    lastBackupStatus,
    safelyExecuteWhenReady,
  ]);
};
