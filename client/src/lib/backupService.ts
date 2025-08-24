import { encryptBackup, decryptBackup, zipDirectory } from "noah-tools";
import { Result, ResultAsync } from "neverthrow";
import { completeUpload, getUploadUrl } from "./api";
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
}
