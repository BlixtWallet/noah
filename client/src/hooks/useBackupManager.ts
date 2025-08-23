import { useState } from "react";
import { Result, ok, err, ResultAsync } from "neverthrow";
import { BackupService } from "../lib/backupService";
import {
  getUploadUrl,
  completeUpload,
  listBackups as listBackupsApi,
  getDownloadUrl,
  deleteBackup as deleteBackupApi,
  updateBackupSettings,
} from "../lib/api";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { useExportDatabase } from "./useExportDatabase";
import { unzipFile } from "noah-tools";
import { CACHES_DIRECTORY_PATH } from "~/constants";
import { getMnemonic } from "~/lib/walletApi";
import { useServerStore } from "../store/serverStore";
import logger from "~/lib/log";

const log = logger("backupManager");

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
  restoreBackup: (version?: number) => Promise<Result<void, Error>>;
  deleteBackup: (version: number) => Promise<Result<void, Error>>;
  isLoading: boolean;
  backupsList: BackupInfo[] | null;
}

export const useBackupManager = (): UseBackupManager => {
  const { isBackupEnabled, setBackupEnabled: setBackupEnabledStore } = useServerStore();
  const [isLoading, setIsLoading] = useState(false);
  const [backupsList, setBackupsList] = useState<BackupInfo[] | null>(null);
  const backupService = new BackupService();
  const { exportDatabaseToZip } = useExportDatabase();

  const setBackupEnabled = async (enabled: boolean) => {
    setIsLoading(true);
    setBackupEnabledStore(enabled);
    const updateResult = await updateBackupSettings({ backup_enabled: enabled });
    if (updateResult.isErr()) {
      console.error("Failed to update backup settings:", updateResult.error);
      // Revert the local state if the API call failed
      setBackupEnabledStore(!enabled);
    }
    setIsLoading(false);
  };

  const triggerBackup = async (): Promise<Result<void, Error>> => {
    setIsLoading(true);
    const zipResult = await exportDatabaseToZip();
    if (zipResult.isErr()) {
      setIsLoading(false);
      return err(zipResult.error);
    }
    const { outputPath: outputZipPath } = zipResult.value;

    log.d("outputZipPath", [outputZipPath]);

    const seedphrase = await getMnemonic();
    if (seedphrase.isErr()) {
      setIsLoading(false);
      return err(seedphrase.error);
    }

    const encryptedDataResult = await backupService.encryptBackupFile(
      outputZipPath,
      seedphrase.value,
    );

    if (encryptedDataResult.isErr()) {
      setIsLoading(false);
      return err(encryptedDataResult.error);
    }

    // Debug: Check the encrypted data
    log.d("Encrypted data length:", [encryptedDataResult.value.length]);

    // Calculate backup size from encrypted data
    const backup_size = encryptedDataResult.value.length;

    const uploadUrlResult = await getUploadUrl({
      backup_version: 1, // Implement version rotation
      backup_size,
    });

    log.d("uploadUrlResult", [uploadUrlResult]);

    if (uploadUrlResult.isErr()) {
      setIsLoading(false);
      return err(uploadUrlResult.error);
    }

    const { upload_url, s3_key } = uploadUrlResult.value;

    // Upload directly as raw data, not multipart form data
    const uploadResult = await ResultAsync.fromPromise(
      fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: encryptedDataResult.value,
      }),
      (e) => e as Error,
    );

    if (uploadResult.isErr()) {
      setIsLoading(false);
      return err(uploadResult.error);
    }

    const response = uploadResult.value;
    if (!response.ok) {
      setIsLoading(false);
      return err(new Error(`Upload failed: ${response.status} ${response.statusText}`));
    }

    const completeUploadResult = await completeUpload({
      s3_key,
      backup_version: 1,
      backup_size,
    });

    if (completeUploadResult.isErr()) {
      setIsLoading(false);
      return err(completeUploadResult.error);
    }

    const unlinkResult = await ResultAsync.fromPromise(
      RNFS.unlink(outputZipPath),
      (e) => e as Error,
    );

    if (unlinkResult.isErr()) {
      setIsLoading(false);
      return err(unlinkResult.error);
    }

    // Refresh the backups list after successful backup
    const refreshResult = await listBackupsApi();
    if (refreshResult.isOk()) {
      setBackupsList(refreshResult.value);
    }

    const result = ok(undefined);
    setIsLoading(false);
    return result;
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

  const restoreBackup = async (version?: number): Promise<Result<void, Error>> => {
    setIsLoading(true);
    const downloadUrlResult = await getDownloadUrl({ backup_version: version });
    log.d("downloadUrlResult", [downloadUrlResult]);

    if (downloadUrlResult.isErr()) {
      setIsLoading(false);
      return err(downloadUrlResult.error);
    }

    const { download_url } = downloadUrlResult.value;
    const outputPath = `${RNFS.TemporaryDirectoryPath}/backup.zip`;

    log.d("outputPath", [outputPath]);

    const downloadResult = await ResultAsync.fromPromise(
      RNFS.downloadFile({
        fromUrl: download_url,
        toFile: outputPath,
      }).promise,
      (e) => e as Error,
    );

    if (downloadResult.isErr()) {
      setIsLoading(false);
      return err(downloadResult.error);
    }

    const seedphrase = await getMnemonic();
    if (seedphrase.isErr()) {
      setIsLoading(false);
      return err(seedphrase.error);
    }

    // Debug: Check what we actually downloaded
    const fileStatsResult = await ResultAsync.fromPromise(RNFS.stat(outputPath), (e) => e as Error);

    if (fileStatsResult.isErr()) {
      setIsLoading(false);
      return err(fileStatsResult.error);
    }

    log.d("Downloaded file stats:", [fileStatsResult.value]);

    const encryptedDataResult = await ResultAsync.fromPromise(
      RNFS.readFile(outputPath, "utf8"),
      (e) => e as Error,
    );

    if (encryptedDataResult.isErr()) {
      setIsLoading(false);
      return err(encryptedDataResult.error);
    }

    const encryptedData = encryptedDataResult.value;
    log.d("Downloaded data length:", [encryptedData.length]);

    const decryptedPathResult = await backupService.decryptBackupFile(
      encryptedData.trim(),
      seedphrase.value,
      outputPath,
    );

    log.d("decryptedPathResult", [decryptedPathResult]);

    if (decryptedPathResult.isErr()) {
      setIsLoading(false);
      return err(decryptedPathResult.error);
    }

    log.d("decryptedPathResult", [decryptedPathResult]);

    // Unzip and log contents
    const unzipDirectory = `${CACHES_DIRECTORY_PATH}/restored_backup`;
    const unzipResult = await ResultAsync.fromPromise(
      unzipFile(decryptedPathResult.value, unzipDirectory),
      (e) => e as Error,
    );

    if (unzipResult.isErr()) {
      setIsLoading(false);
      return err(unzipResult.error);
    }

    log.d("Unzip result:", [unzipResult.value]);

    // Check if the unzip directory exists and get its stats
    const dirExistsResult = await ResultAsync.fromPromise(
      RNFS.exists(unzipDirectory),
      (e) => e as Error,
    );

    if (dirExistsResult.isOk()) {
      log.d("Unzip directory exists:", [dirExistsResult.value]);

      if (dirExistsResult.value) {
        const dirStatsResult = await ResultAsync.fromPromise(
          RNFS.stat(unzipDirectory),
          (e) => e as Error,
        );

        if (dirStatsResult.isOk()) {
          log.d("Unzip directory stats:", [dirStatsResult.value]);
        } else {
          log.d("Error getting unzip directory stats:", [dirStatsResult.error]);
        }
      }
    } else {
      log.d("Error checking unzip directory:", [dirExistsResult.error]);
    }

    // List contents of unzipped directory
    const listContents = async (dir: string, prefix = ""): Promise<void> => {
      log.d(`${prefix}Attempting to read directory: ${dir}`);

      const readDirResult = await ResultAsync.fromPromise(RNFS.readDir(dir), (e) => e as Error);

      if (readDirResult.isErr()) {
        log.d(`${prefix}Error reading directory ${dir}:`, [readDirResult.error]);
        return;
      }

      const items = readDirResult.value;
      log.d(`${prefix}Found ${items.length} items in ${dir}`);

      for (const item of items) {
        log.d(
          `${prefix}${item.name} (${item.isDirectory() ? "directory" : "file"} - ${item.size} bytes)`,
        );
        if (item.isDirectory()) {
          await listContents(item.path, `${prefix}  `);
        }
      }
    };

    log.d("=== RESTORED BACKUP CONTENTS ===");
    await listContents(unzipDirectory);
    log.d("=== END BACKUP CONTENTS ===");

    setIsLoading(false);
    return ok(undefined);
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
    restoreBackup,
    deleteBackup,
    isLoading,
    backupsList,
  };
};
