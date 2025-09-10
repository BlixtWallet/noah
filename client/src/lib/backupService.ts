import { createBackup, restoreBackup as restoreBackupNative } from "noah-tools";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { completeUpload, getDownloadUrlForRestore, getK1, getUploadUrl } from "./api";
import { getMnemonic, setMnemonic } from "./crypto";
import {
  deriveKeypairFromMnemonic,
  signMesssageWithMnemonic,
  loadWalletIfNeeded,
} from "./walletApi";
import { useWalletStore } from "~/store/walletStore";
import logger from "~/lib/log";
import { APP_VARIANT } from "~/config";
import ky from "ky";

const log = logger("backupService");

export class BackupService {
  async performBackup() {
    // Get mnemonic for encryption
    const mnemonicResult = await getMnemonic();
    if (mnemonicResult.isErr()) {
      return mnemonicResult;
    }

    log.d("Performing backup");

    // Create and encrypt the backup file natively
    const encryptedDataResult = await ResultAsync.fromPromise(
      createBackup(mnemonicResult.value),
      (e) => e as Error,
    );

    if (encryptedDataResult.isErr()) {
      return encryptedDataResult;
    }

    const backup_size = encryptedDataResult.value.length;
    log.d("backup_size", [backup_size]);

    // Get upload URL from server
    const uploadUrlResult = await getUploadUrl({
      backup_version: 1, // TODO: Implement proper version management
    });

    if (uploadUrlResult.isErr()) {
      return uploadUrlResult;
    }

    log.d("uploadUrlResult", [uploadUrlResult.value]);
    const { upload_url, s3_key } = uploadUrlResult.value;

    // Upload the encrypted backup to S3
    const uploadResult = await ResultAsync.fromPromise(
      ky.put(upload_url, {
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

    return ok(undefined);
  }

  async restoreBackup(mnemonic: string, version?: number): Promise<Result<void, Error>> {
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

    if (downloadUrlResult.isErr()) {
      return err(downloadUrlResult.error);
    }
    log.d("downloadUrlResult", [downloadUrlResult.value]);

    const { download_url } = downloadUrlResult.value;

    // Download the backup file
    const responseResult = await ResultAsync.fromPromise(
      ky.get(download_url).text(),
      (e) => e as Error,
    );
    if (responseResult.isErr()) {
      return err(responseResult.error);
    }

    const encryptedData = responseResult.value;
    log.d("Downloaded data length:", [encryptedData.length]);

    // Decrypt, unzip, and restore the backup natively
    const restoreResult = await ResultAsync.fromPromise(
      restoreBackupNative(encryptedData.trim(), mnemonic),
      (e) => e as Error,
    );

    if (restoreResult.isErr()) {
      return err(restoreResult.error);
    }

    return ok(undefined);
  }
}

export const restoreWallet = async (mnemonic: string): Promise<Result<void, Error>> => {
  const backupService = new BackupService();
  const restoreResult = await backupService.restoreBackup(mnemonic);

  if (restoreResult.isErr()) {
    return err(restoreResult.error);
  }

  const setMnemonicResult = await ResultAsync.fromPromise(setMnemonic(mnemonic), (e) => e as Error);

  if (setMnemonicResult.isErr()) {
    return err(setMnemonicResult.error);
  }

  const loadWalletResult = await ResultAsync.fromPromise(loadWalletIfNeeded(), (e) => e as Error);

  if (loadWalletResult.isErr()) {
    return err(loadWalletResult.error);
  }

  useWalletStore.setState({ isInitialized: true, isWalletLoaded: true });

  // The native code handles restoring the files. An app restart is
  // recommended to ensure all services reload the restored data.

  return ok(undefined);
};
