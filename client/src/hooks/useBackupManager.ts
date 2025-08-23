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
import { useExportDatabase } from "./useExportDatabase";
import { unzipFile } from "noah-tools";

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
  const { exportDatabaseToZip } = useExportDatabase();

  const setBackupEnabled = async (enabled: boolean) => {
    setIsBackupEnabled(enabled);
    await updateBackupSettings({ backup_enabled: enabled });
  };

  const triggerBackup = async (): Promise<Result<void, Error>> => {
    try {
      const zipResult = await exportDatabaseToZip();
      if (zipResult.isErr()) {
        return err(zipResult.error);
      }
      const { outputPath: outputZipPath } = zipResult.value;

      console.log("outputZipPath", outputZipPath);

      const seedphrase = "test-seedphrase"; // Replace with actual seedphrase
      const encryptedDataResult = await backupService.encryptBackupFile(outputZipPath, seedphrase);

      console.log("encryptedDataResult", encryptedDataResult);

      if (encryptedDataResult.isErr()) {
        return err(encryptedDataResult.error);
      }

      // Debug: Check the encrypted data
      console.log("Encrypted data length:", encryptedDataResult.value.length);
      console.log("Encrypted data first 100 chars:", encryptedDataResult.value.substring(0, 100));
      console.log(
        "Encrypted data last 100 chars:",
        encryptedDataResult.value.substring(encryptedDataResult.value.length - 100),
      );

      // Check if it looks like base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      console.log(
        "Encrypted data is valid base64 format:",
        base64Regex.test(encryptedDataResult.value),
      );

      // Calculate backup size from encrypted data
      const backup_size = encryptedDataResult.value.length;

      const uploadUrlResult = await getUploadUrl({
        backup_version: 1, // Implement version rotation
        backup_size,
      });

      console.log("uploadUrlResult", uploadUrlResult);

      if (uploadUrlResult.isErr()) {
        return err(uploadUrlResult.error);
      }

      const { upload_url, s3_key } = uploadUrlResult.value;

      // Upload directly as raw data, not multipart form data
      const response = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: encryptedDataResult.value,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      await completeUpload({
        s3_key,
        backup_version: 1,
        backup_size,
      });

      await RNFS.unlink(outputZipPath);

      return ok(undefined);
    } catch (e) {
      console.error(e);
      return err(e as Error);
    }
  };

  const listBackups = async (): Promise<Result<BackupInfo[], Error>> => {
    return listBackupsApi();
  };

  const restoreBackup = async (version?: number): Promise<Result<void, Error>> => {
    try {
      const downloadUrlResult = await getDownloadUrl({ backup_version: version });
      console.log("downloadUrlResult", downloadUrlResult);

      if (downloadUrlResult.isErr()) {
        return err(downloadUrlResult.error);
      }

      const { download_url } = downloadUrlResult.value;
      const outputPath = `${RNFS.TemporaryDirectoryPath}/backup.zip`;

      console.log("outputPath", outputPath);

      await RNFS.downloadFile({
        fromUrl: download_url,
        toFile: outputPath,
      }).promise;

      const seedphrase = "test-seedphrase"; // Replace with actual seedphrase

      // Debug: Check what we actually downloaded
      const fileStats = await RNFS.stat(outputPath);
      console.log("Downloaded file stats:", fileStats);

      const encryptedData = await RNFS.readFile(outputPath, "utf8");
      console.log("Downloaded data length:", encryptedData.length);
      console.log("Downloaded data first 100 chars:", encryptedData.substring(0, 100));
      console.log(
        "Downloaded data last 100 chars:",
        encryptedData.substring(encryptedData.length - 100),
      );

      // Check if it looks like base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      console.log("Is valid base64 format:", base64Regex.test(encryptedData.trim()));

      const decryptedPathResult = await backupService.decryptBackupFile(
        encryptedData.trim(),
        seedphrase,
        outputPath,
      );

      console.log("decryptedPathResult", decryptedPathResult);

      if (decryptedPathResult.isErr()) {
        return err(decryptedPathResult.error);
      }

      console.log("decryptedPathResult", decryptedPathResult);

      // Unzip and log contents
      const unzipDirectory = `${RNFS.TemporaryDirectoryPath}/restored_backup`;
      const unzipResult = await unzipFile(decryptedPathResult.value, unzipDirectory);
      console.log("Unzip result:", unzipResult);

      // List contents of unzipped directory
      const listContents = async (dir: string, prefix = ""): Promise<void> => {
        const items = await RNFS.readDir(dir);
        for (const item of items) {
          console.log(
            `${prefix}${item.name} (${item.isDirectory() ? "directory" : "file"} - ${item.size} bytes)`,
          );
          if (item.isDirectory()) {
            await listContents(item.path, `${prefix}  `);
          }
        }
      };

      await listContents(unzipDirectory);

      // Clean up
      await RNFS.unlink(unzipDirectory);

      return ok(undefined);
    } catch (e) {
      console.error(e);
      return err(e as Error);
    }
  };

  const deleteBackup = async (version: number): Promise<Result<void, Error>> => {
    const result = await deleteBackupApi({ backup_version: version });
    return result.map(() => undefined);
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
