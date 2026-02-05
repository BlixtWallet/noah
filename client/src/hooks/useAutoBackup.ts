import { useEffect } from "react";
import { triggerAutoBackup } from "~/lib/backupAuto";
import { useBackupStore } from "~/store/backupStore";
import { useServerStore } from "~/store/serverStore";
import { useWalletStore } from "~/store/walletStore";
import { useBackgroundJobCoordination } from "~/hooks/useBackgroundJobCoordination";
import {
  AUTO_BACKUP_FRESHNESS_MS,
  AUTO_BACKUP_IN_PROGRESS_TIMEOUT_MS,
} from "~/constants";
import logger from "~/lib/log";

const log = logger("useAutoBackup");

export const useAutoBackup = (isReady: boolean) => {
  const { safelyExecuteWhenReady } = useBackgroundJobCoordination();
  const { isBackupEnabled } = useServerStore();
  const { lastBackupAt, lastBackupAttemptAt, lastBackupStatus, setBackupFailed } =
    useBackupStore();
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

  useEffect(() => {
    if (lastBackupStatus !== "in_progress") {
      return;
    }

    const attemptAt = lastBackupAttemptAt ?? 0;
    if (!attemptAt) {
      log.w("Backup marked in progress without attempt timestamp, clearing status");
      setBackupFailed("Previous backup did not complete. Please retry.");
      return;
    }

    const now = Date.now();
    const expiresAt = attemptAt + AUTO_BACKUP_IN_PROGRESS_TIMEOUT_MS;

    if (now >= expiresAt) {
      log.w("Backup timed out, clearing stale in-progress state");
      setBackupFailed("Backup timed out. Please retry.");
      return;
    }

    const delayMs = expiresAt - now;
    const timeoutId = setTimeout(() => {
      log.w("Backup timed out, clearing stale in-progress state");
      setBackupFailed("Backup timed out. Please retry.");
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [lastBackupAttemptAt, lastBackupStatus, setBackupFailed]);
};
