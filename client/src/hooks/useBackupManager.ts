import { useState } from "react";
import { Result, ok, err } from "neverthrow";
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
import { zipDirectory } from "noah-tools";

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
}

export const useBackupManager = (): UseBackupManager => {
  const [isBackupEnabled, setIsBackupEnabled] = useState(false);
  const backupService = new BackupService();

  const setBackupEnabled = async (enabled: boolean) => {
    setIsBackupEnabled(enabled);
    await updateBackupSettings({ backup_enabled: enabled });
  };

  const triggerBackup = async (): Promise<Result<void, Error>> => {
    try {
      const sourceDirectory = `${RNFS.DocumentDirectoryPath}/noah-data`;
      const outputZipPath = `${RNFS.TemporaryDirectoryPath}/backup.zip`;
      await zipDirectory(sourceDirectory, outputZipPath);

      const seedphrase = "test-seedphrase"; // Replace with actual seedphrase
      const encryptedDataResult = await backupService.encryptBackupFile(outputZipPath, seedphrase);

      if (encryptedDataResult.isErr()) {
        return err(encryptedDataResult.error);
      }

      const stats = await RNFS.stat(outputZipPath);
      const backup_size = stats.size;

      const uploadUrlResult = await getUploadUrl({
        backup_version: 1, // Implement version rotation
        backup_size,
      });

      if (uploadUrlResult.isErr()) {
        return err(uploadUrlResult.error);
      }

      const { upload_url, s3_key } = uploadUrlResult.value;

      await RNFS.uploadFiles({
        toUrl: upload_url,
        files: [
          {
            name: "backup",
            filename: "backup.zip",
            filepath: outputZipPath,
            filetype: "application/zip",
          },
        ],
        method: "PUT",
        headers: {
          "Content-Type": "application/zip",
        },
      }).promise;

      await completeUpload({
        s3_key,
        backup_version: 1,
        backup_size,
      });

      await RNFS.unlink(outputZipPath);

      return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };

  const listBackups = async (): Promise<Result<BackupInfo[], Error>> => {
    return listBackupsApi();
  };

  const restoreBackup = async (version?: number): Promise<Result<void, Error>> => {
    try {
      const downloadUrlResult = await getDownloadUrl({ backup_version: version });
      if (downloadUrlResult.isErr()) {
        return err(downloadUrlResult.error);
      }

      const { download_url } = downloadUrlResult.value;
      const outputPath = `${RNFS.TemporaryDirectoryPath}/backup.zip`;

      await RNFS.downloadFile({
        fromUrl: download_url,
        toFile: outputPath,
      }).promise;

      const seedphrase = "test-seedphrase"; // Replace with actual seedphrase
      const encryptedData = await RNFS.readFile(outputPath, "base64");
      const decryptedPathResult = await backupService.decryptBackupFile(
        encryptedData,
        seedphrase,
        outputPath,
      );

      if (decryptedPathResult.isErr()) {
        return err(decryptedPathResult.error);
      }

      // Unzip and restore
      // ...

      return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };

  const deleteBackup = async (version: number): Promise<Result<void, Error>> => {
    return deleteBackupApi({ backup_version: version });
  };

  return {
    isBackupEnabled,
    setBackupEnabled,
    triggerBackup,
    listBackups,
    restoreBackup,
    deleteBackup,
  };
};
