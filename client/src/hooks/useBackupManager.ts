import { useState } from "react";
import { Result, ok, err } from "neverthrow";
import { BackupService } from "../lib/backupService";
import {
  listBackups as listBackupsApi,
  deleteBackup as deleteBackupApi,
  updateBackupSettings,
} from "../lib/api";

import { useServerStore } from "../store/serverStore";
import logger from "~/lib/log";

const log = logger("useBackupManager");

interface BackupInfo {
  backup_version: number;
  created_at: string;
  backup_size: number;
}

interface UseBackupManager {
  isBackupEnabled: boolean;
  setBackupEnabled: (enabled: boolean) => void;
  triggerBackup: () => Promise<Result<void, Error>>;
  listBackups: () => Promise<Result<BackupInfo[], Error>>;
  deleteBackup: (version: number) => Promise<Result<void, Error>>;
  isLoading: boolean;
  backupsList: BackupInfo[] | null;
}

export const useBackupManager = (): UseBackupManager => {
  const { isBackupEnabled, setBackupEnabled: setBackupEnabledStore } = useServerStore();
  const [isLoading, setIsLoading] = useState(false);
  const [backupsList, setBackupsList] = useState<BackupInfo[] | null>(null);
  const backupService = new BackupService();

  const setBackupEnabled = async (enabled: boolean) => {
    setIsLoading(true);
    setBackupEnabledStore(enabled);
    const updateResult = await updateBackupSettings({ backup_enabled: enabled });
    if (updateResult.isErr()) {
      log.e("Failed to update backup settings:", [updateResult.error]);
      // Revert the local state if the API call failed
      setBackupEnabledStore(!enabled);
    }
    setIsLoading(false);
  };

  const triggerBackup = async (): Promise<Result<void, Error>> => {
    setIsLoading(true);

    const backupResult = await backupService.performBackup();

    if (backupResult.isErr()) {
      setIsLoading(false);
      return err(backupResult.error);
    }

    // Refresh the backups list after successful backup
    const refreshResult = await listBackupsApi();
    if (refreshResult.isOk()) {
      setBackupsList(refreshResult.value);
    }

    setIsLoading(false);
    return ok(undefined);
  };

  const listBackups = async (): Promise<Result<BackupInfo[], Error>> => {
    setIsLoading(true);
    const result = await listBackupsApi();
    if (result.isOk()) {
      setBackupsList(result.value);
    }
    setIsLoading(false);
    return result;
  };

  const deleteBackup = async (version: number): Promise<Result<void, Error>> => {
    setIsLoading(true);
    const result = await deleteBackupApi({ backup_version: version });

    if (result.isOk()) {
      // Update the local backups list by removing the deleted backup
      setBackupsList((prev) =>
        prev ? prev.filter((backup) => backup.backup_version !== version) : null,
      );
    }

    setIsLoading(false);
    return result.map(() => undefined);
  };

  return {
    isBackupEnabled,
    setBackupEnabled,
    triggerBackup,
    listBackups,
    deleteBackup,
    isLoading,
    backupsList,
  };
};
