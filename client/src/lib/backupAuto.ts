import { ok, Result } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import logger from "~/lib/log";
import { redactSensitiveErrorMessage } from "~/lib/errorUtils";
import { useBackupStore } from "~/store/backupStore";
import { useServerStore } from "~/store/serverStore";
import { useWalletStore } from "~/store/walletStore";
import {
  AUTO_BACKUP_FRESHNESS_MS,
  AUTO_BACKUP_MIN_INTERVAL_MS,
} from "~/constants";

const log = logger("backupAuto");

let autoBackupInFlight = false;

export type AutoBackupReason = "wallet_created" | "app_open";

type AutoBackupOptions = {
  force?: boolean;
};

const shouldTriggerAutoBackup = (options: AutoBackupOptions): boolean => {
  const { lastBackupAt, lastBackupAttemptAt, lastBackupStatus } = useBackupStore.getState();
  const { isBackupEnabled } = useServerStore.getState();
  const { isWalletSuspended } = useWalletStore.getState();

  if (isWalletSuspended) {
    return false;
  }

  if (lastBackupStatus === "in_progress") {
    return false;
  }

  if (!options.force && !isBackupEnabled) {
    return false;
  }

  const now = Date.now();
  if (!options.force && lastBackupAt && now - lastBackupAt < AUTO_BACKUP_FRESHNESS_MS) {
    return false;
  }

  if (!options.force && lastBackupAttemptAt && now - lastBackupAttemptAt < AUTO_BACKUP_MIN_INTERVAL_MS) {
    return false;
  }

  return true;
};

export const triggerAutoBackup = async (
  reason: AutoBackupReason,
  options: AutoBackupOptions = {},
): Promise<Result<void, Error>> => {
  if (autoBackupInFlight) {
    log.d("Auto-backup already running", [reason]);
    return ok(undefined);
  }

  if (!shouldTriggerAutoBackup(options)) {
    log.d("Skipping auto-backup", [reason]);
    return ok(undefined);
  }

  autoBackupInFlight = true;
  try {
    log.i("Auto-backup starting", [reason]);
    const backupService = new BackupService();
    const result = await backupService.performBackup();
    if (result.isErr()) {
      log.w("Auto-backup failed", [reason, redactSensitiveErrorMessage(result.error)]);
    } else {
      log.d("Auto-backup completed", [reason]);
    }
    return result;
  } finally {
    autoBackupInFlight = false;
  }
};
