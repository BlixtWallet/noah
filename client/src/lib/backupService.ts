import { encryptBackup, decryptBackup, zipDirectory, unzipFile } from "noah-tools";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { completeUpload, getDownloadUrlForRestore, getK1, getUploadUrl } from "./api";
import { getMnemonic, setMnemonic } from "./crypto";
import {
  deriveKeypairFromMnemonic,
  signMesssageWithMnemonic,
  loadWalletIfNeeded,
} from "./walletApi";
import { useWalletStore } from "~/store/walletStore";
import { CACHES_DIRECTORY_PATH, DOCUMENT_DIRECTORY_PATH, ARK_DATA_PATH } from "~/constants";
import * as RNFS from "@dr.pogodin/react-native-fs";
import logger from "~/lib/log";
import { APP_VARIANT } from "~/config";

const log = logger("backupService");

export class BackupService {
  async encryptBackupFile(backupPath: string, mnemonic: string): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(encryptBackup(backupPath, mnemonic), (e) => e as Error);
  }

  async decryptBackupFile(
    encryptedData: string,
    mnemonic: string,
    outputPath: string,
  ): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(
      decryptBackup(encryptedData, mnemonic, outputPath),
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

    // Get mnemonic for encryption
    const mnemonicResult = await getMnemonic();
    if (mnemonicResult.isErr()) {
      return mnemonicResult;
    }

    // Encrypt the backup file
    const encryptedDataResult = await this.encryptBackupFile(outputZipPath, mnemonicResult.value);

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

  async restoreBackup(mnemonic: string, version?: number): Promise<Result<string, Error>> {
    const k1Result = await getK1();
    if (k1Result.isErr()) {
      return err(k1Result.error);
    }

    const k1 = k1Result.value;

    log.d("k1", [k1]);

    // Sign the k1 with mnemonic
    const signatureResult = await signMesssageWithMnemonic(k1, mnemonic, APP_VARIANT, 0);
    if (signatureResult.isErr()) {
      return err(signatureResult.error);
    }

    const sig = signatureResult.value;

    log.d("sig", [sig]);

    // Derive keypair from mnemonic
    const keypairResult = await deriveKeypairFromMnemonic(mnemonic, APP_VARIANT, 0);
    if (keypairResult.isErr()) {
      return err(keypairResult.error);
    }
    const { public_key: key } = keypairResult.value;

    log.d("key", [key]);

    const downloadUrlResult = await getDownloadUrlForRestore({
      backup_version: version,
      k1,
      sig,
      key,
    });

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
      mnemonic,
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

export const restoreWallet = async (mnemonic: string): Promise<Result<void, Error>> => {
  const backupService = new BackupService();
  const restoreResult = await backupService.restoreBackup(mnemonic);

  if (restoreResult.isErr()) {
    return err(restoreResult.error);
  }

  const unzippedPath = restoreResult.value;
  const mmkvSourcePath = `${unzippedPath}/mmkv`;
  const dbSourcePath = `${unzippedPath}/noah-data-${APP_VARIANT}/db.sqlite`;

  const mmkvDestPath = `${DOCUMENT_DIRECTORY_PATH}/mmkv`;
  const dbDestPath = `${ARK_DATA_PATH}/db.sqlite`;

  try {
    // Remove the existing documents directory if it exists
    const dirExists = await RNFS.exists(DOCUMENT_DIRECTORY_PATH);
    if (dirExists) {
      await RNFS.unlink(DOCUMENT_DIRECTORY_PATH);
    }

    await RNFS.mkdir(DOCUMENT_DIRECTORY_PATH);
    await RNFS.mkdir(ARK_DATA_PATH);
    await RNFS.moveFile(mmkvSourcePath, mmkvDestPath);
    await RNFS.moveFile(dbSourcePath, dbDestPath);
    await setMnemonic(mnemonic);

    await loadWalletIfNeeded();
    useWalletStore.setState({ isInitialized: true, isWalletLoaded: true });
    return ok(undefined);
  } catch (e) {
    log.e("Error during restore:", [e as Error]);
    return err(e as Error);
  }
};
