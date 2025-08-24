import { encryptBackup, decryptBackup, zipDirectory, unzipFile } from "noah-tools";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { completeUpload, getDownloadUrl, getUploadUrl } from "./api";
import { getMnemonic } from "./walletApi";
import { CACHES_DIRECTORY_PATH, DOCUMENT_DIRECTORY_PATH } from "~/constants";
import * as RNFS from "@dr.pogodin/react-native-fs";
import logger from "~/lib/log";

const log = logger("backupService");

export class BackupService {
  async encryptBackupFile(backupPath: string, seedphrase: string): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(encryptBackup(backupPath, seedphrase), (e) => e as Error);
  }

  async decryptBackupFile(
    encryptedData: string,
    seedphrase: string,
    outputPath: string,
  ): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(
      decryptBackup(encryptedData, seedphrase, outputPath),
      (e) => e as Error,
    );
  }

  async performBackup() {
    // Create database export zip
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").split("T")[0];
    const timeComponent = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split(".")[0];
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `noah_database_export_${timestamp}_${timeComponent}_${randomId}.zip`;
    const outputZipPath = `${CACHES_DIRECTORY_PATH}/${filename}`;

    log.d("outputZipPath", [outputZipPath]);

    // Create zip file using the native zipDirectory method
    const zipResult = await ResultAsync.fromPromise(
      zipDirectory(DOCUMENT_DIRECTORY_PATH, outputZipPath),
      (e) => e as Error,
    );

    if (zipResult.isErr()) {
      return zipResult;
    }

    log.d("zipResult", [zipResult.value]);

    // Get seedphrase for encryption
    const seedphrase = await getMnemonic();
    if (seedphrase.isErr()) {
      return seedphrase;
    }

    // Encrypt the backup file
    const encryptedDataResult = await this.encryptBackupFile(outputZipPath, seedphrase.value);

    if (encryptedDataResult.isErr()) {
      return encryptedDataResult;
    }

    const backup_size = encryptedDataResult.value.length;

    log.d("backup_size", [backup_size]);

    // Get upload URL from server
    const uploadUrlResult = await getUploadUrl({
      backup_version: 1, // TODO: Implement proper version management
      backup_size,
    });

    if (uploadUrlResult.isErr()) {
      return uploadUrlResult;
    }

    log.d("uploadUrlResult", [uploadUrlResult.value]);

    const { upload_url, s3_key } = uploadUrlResult.value;

    // Upload the encrypted backup to S3
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
      return uploadResult;
    }

    const response = uploadResult.value;
    if (!response.ok) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Upload failed: ${response.status} ${response.statusText}`)),
      );
    }

    log.d("response", [response]);

    // Complete the upload process
    const completeUploadResult = await completeUpload({
      s3_key,
      backup_version: 1,
      backup_size,
    });

    if (completeUploadResult.isErr()) {
      return completeUploadResult;
    }

    log.d("completeUploadResult", [completeUploadResult.value]);

    // Clean up the temporary zip file
    await ResultAsync.fromPromise(RNFS.unlink(outputZipPath), (e) => e as Error);

    return ResultAsync.fromSafePromise(Promise.resolve(undefined));
  }

  async restoreBackup(seedPhrase: string, version?: number): Promise<Result<string, Error>> {
    const downloadUrlResult = await getDownloadUrl({ backup_version: version });
    log.d("downloadUrlResult", [downloadUrlResult]);

    if (downloadUrlResult.isErr()) {
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
      return err(downloadResult.error);
    }

    // Debug: Check what we actually downloaded
    const fileStatsResult = await ResultAsync.fromPromise(RNFS.stat(outputPath), (e) => e as Error);

    if (fileStatsResult.isErr()) {
      return err(fileStatsResult.error);
    }

    log.d("Downloaded file stats:", [fileStatsResult.value]);

    const encryptedDataResult = await ResultAsync.fromPromise(
      RNFS.readFile(outputPath, "utf8"),
      (e) => e as Error,
    );

    if (encryptedDataResult.isErr()) {
      return err(encryptedDataResult.error);
    }

    const encryptedData = encryptedDataResult.value;
    log.d("Downloaded data length:", [encryptedData.length]);

    const decryptedPathResult = await this.decryptBackupFile(
      encryptedData.trim(),
      seedPhrase,
      outputPath,
    );

    log.d("decryptedPathResult", [decryptedPathResult]);

    if (decryptedPathResult.isErr()) {
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

    return ok(unzipDirectory);
  }
}
