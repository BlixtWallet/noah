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
import {
  CACHES_DIRECTORY_PATH,
  DOCUMENT_DIRECTORY_PATH,
  ARK_DATA_PATH,
  PLATFORM,
} from "~/constants";
import NitroFS from "react-native-nitro-fs";
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
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").split("T")[0];
    const timeComponent = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split(".")[0];
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `noah_backup_${timestamp}_${timeComponent}_${randomId}.zip`;
    const outputZipPath = `${CACHES_DIRECTORY_PATH}/${filename}`;
    const backupStagingPath = `${CACHES_DIRECTORY_PATH}/backup_staging`;

    log.d("outputZipPath", [outputZipPath]);
    log.d("backupStagingPath", [backupStagingPath]);

    try {
      // Clean up previous staging directory if it exists
      if (await NitroFS.exists(backupStagingPath)) {
        await NitroFS.unlink(backupStagingPath);
      }
      await NitroFS.mkdir(backupStagingPath);

      // Define platform-specific paths
      const mmkvPath =
        PLATFORM === "ios"
          ? `${DOCUMENT_DIRECTORY_PATH.replace(/\/files$/, "")}/mmkv`
          : `${DOCUMENT_DIRECTORY_PATH}/mmkv`;
      const dataPath = ARK_DATA_PATH;

      console.log("mmkvPath", mmkvPath);
      console.log("dataPath", dataPath);

      console.log("mmkv path exists", await NitroFS.exists(mmkvPath));
      if (await NitroFS.exists(mmkvPath)) {
        await NitroFS.copy(mmkvPath, `${backupStagingPath}/mmkv`);
      }
      if (await NitroFS.exists(dataPath)) {
        await NitroFS.copy(dataPath, `${backupStagingPath}/noah-data-${APP_VARIANT}`);
      }

      // Create zip file from the staging directory
      const zipResult = await ResultAsync.fromPromise(
        zipDirectory(backupStagingPath, outputZipPath),
        (e) => e as Error,
      );

      if (zipResult.isErr()) {
        return zipResult;
      }
    } catch (e) {
      log.e("Error during backup staging", [e]);
      return err(e as Error);
    } finally {
      // Clean up staging directory
      if (await NitroFS.exists(backupStagingPath)) {
        await NitroFS.unlink(backupStagingPath);
      }
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
    await ResultAsync.fromPromise(NitroFS.unlink(outputZipPath), (e) => e as Error);

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
    const outputPath = `${NitroFS.CACHE_DIR}/backup.zip`;

    log.d("outputPath", [outputPath]);

    const downloadResult = await ResultAsync.fromPromise(
      NitroFS.downloadFile(download_url, outputPath),
      (e) => e as Error,
    );

    if (downloadResult.isErr()) {
      return err(downloadResult.error);
    }

    // Debug: Check what we actually downloaded
    const fileStatsResult = await ResultAsync.fromPromise(
      NitroFS.stat(outputPath),
      (e) => e as Error,
    );

    if (fileStatsResult.isErr()) {
      return err(fileStatsResult.error);
    }

    log.d("Downloaded file stats:", [fileStatsResult.value]);

    const encryptedDataResult = await ResultAsync.fromPromise(
      NitroFS.readFile(outputPath, "utf8"),
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
      NitroFS.exists(unzipDirectory),
      (e) => e as Error,
    );

    if (dirExistsResult.isOk()) {
      log.d("Unzip directory exists:", [dirExistsResult.value]);

      if (dirExistsResult.value) {
        const dirStatsResult = await ResultAsync.fromPromise(
          NitroFS.stat(unzipDirectory),
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

      const readDirResult = await ResultAsync.fromPromise(NitroFS.readdir(dir), (e) => e as Error);

      if (readDirResult.isErr()) {
        log.d(`${prefix}Error reading directory ${dir}:`, [readDirResult.error]);
        return;
      }

      const items = readDirResult.value;
      log.d(`${prefix}Found ${items.length} items in ${dir}`);

      for (const item of items) {
        log.d(`${prefix}${item}`);
      }
    };

    log.d("=== RESTORED BACKUP CONTENTS ===");
    await listContents(unzipDirectory);
    log.d("=== END BACKUP CONTENTS ===");

    log.d("Make the document directory path", [DOCUMENT_DIRECTORY_PATH]);
    await NitroFS.mkdir(DOCUMENT_DIRECTORY_PATH);

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

  log.d("unzippedPath", [unzippedPath]);

  try {
    const mmkvSourcePath = `${unzippedPath}/backup_staging/mmkv`;
    const dataSourcePath = `${unzippedPath}/backup_staging/noah-data-${APP_VARIANT}`;

    const mmkvDestPath =
      PLATFORM === "ios"
        ? `${DOCUMENT_DIRECTORY_PATH.replace(/\/files$/, "")}/mmkv`
        : `${DOCUMENT_DIRECTORY_PATH}/mmkv`;
    const dataDestPath = ARK_DATA_PATH;

    // Clean up existing directories
    if (await NitroFS.exists(mmkvDestPath)) {
      await NitroFS.unlink(mmkvDestPath);
    }
    if (await NitroFS.exists(dataDestPath)) {
      await NitroFS.unlink(dataDestPath);
    }

    console.log("mmkv dest path exists", await NitroFS.exists(mmkvDestPath));
    console.log("data dest path exists", await NitroFS.exists(dataDestPath));
    console.log("document directory path exists", await NitroFS.exists(DOCUMENT_DIRECTORY_PATH));

    // Move files from backup
    if (await NitroFS.exists(mmkvSourcePath)) {
      console.log("moving mmkv");
      await NitroFS.copy(mmkvSourcePath, mmkvDestPath);
    }

    console.log("moving data");
    await NitroFS.copy(dataSourcePath, dataDestPath);

    await setMnemonic(mnemonic);
    await loadWalletIfNeeded();
    useWalletStore.setState({ isInitialized: true, isWalletLoaded: true });
    return ok(undefined);
  } catch (e) {
    log.e("Error during restore:", [e as Error]);
    return err(e as Error);
  }
};
