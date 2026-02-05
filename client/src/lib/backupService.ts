import {
  createBackup,
  restoreBackup as restoreBackupNative,
  storeNativeMnemonic,
} from "noah-tools";
import { err, ok, Result, ResultAsync } from "neverthrow";
import {
  completeUpload,
  getDownloadUrlForRestore,
  getK1,
  getUploadUrl,
  updateBackupSettings,
} from "./api";
import { getMnemonic, setMnemonic } from "./crypto";
import {
  deriveKeypairFromMnemonic,
  signMesssageWithMnemonic,
  loadWalletIfNeeded,
} from "./walletApi";
import { useWalletStore } from "~/store/walletStore";
import { useBackupStore } from "~/store/backupStore";
import logger from "~/lib/log";
import { APP_VARIANT } from "~/config";
import ky from "ky";
import { hasGooglePlayServices } from "~/constants";

const updateProgress = (step: string, progress: number) => {
  useWalletStore.getState().setRestoreProgress({ step, progress });
};

const log = logger("backupService");

export class BackupService {
  // This is only for registering backups on startup with the server
  async registerBackup() {
    const registerResult = await updateBackupSettings({ backup_enabled: true });
    if (registerResult.isErr()) {
      log.e("Failed to register backup:", [registerResult.error]);
    }
  }

  async performBackup(): Promise<Result<void, Error>> {
    const backupStore = useBackupStore.getState();
    // Get mnemonic for encryption
    const mnemonicResult = await getMnemonic();
    if (mnemonicResult.isErr()) {
      backupStore.setBackupFailed(mnemonicResult.error.message);
      return err(mnemonicResult.error);
    }

    log.d("Performing backup");
    backupStore.setBackupInProgress();

    // Create and encrypt the backup file natively
    const encryptedDataResult = await ResultAsync.fromPromise(
      createBackup(mnemonicResult.value),
      (e) => e as Error,
    );

    if (encryptedDataResult.isErr()) {
      backupStore.setBackupFailed(encryptedDataResult.error.message);
      return err(encryptedDataResult.error);
    }

    const backup_size = encryptedDataResult.value.length;
    log.d("backup_size", [backup_size]);

    // Get upload URL from server
    const uploadUrlResult = await getUploadUrl({
      backup_version: 1, // TODO: Implement proper version management
    });

    if (uploadUrlResult.isErr()) {
      backupStore.setBackupFailed(uploadUrlResult.error.message);
      return err(uploadUrlResult.error);
    }

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
      backupStore.setBackupFailed(uploadResult.error.message);
      return err(uploadResult.error);
    }

    // Complete the upload process
    const completeUploadResult = await completeUpload({
      s3_key,
      backup_version: 1,
      backup_size,
    });

    if (completeUploadResult.isErr()) {
      backupStore.setBackupFailed(completeUploadResult.error.message);
      return err(completeUploadResult.error);
    }

    log.d("completeUploadResult", [completeUploadResult.value]);
    backupStore.setBackupSuccess();

    return ok(undefined);
  }

  async restoreBackup(mnemonic: string, version?: number): Promise<Result<void, Error>> {
    updateProgress("Authenticating...", 10);
    const k1Result = await getK1();
    if (k1Result.isErr()) {
      return err(k1Result.error);
    }
    const k1 = k1Result.value;
    log.d("k1", [k1]);

    updateProgress("Verifying credentials...", 25);
    const signatureResult = await signMesssageWithMnemonic(k1, mnemonic, APP_VARIANT, 0);
    if (signatureResult.isErr()) {
      return err(signatureResult.error);
    }
    const sig = signatureResult.value;
    log.d("sig", [sig]);

    updateProgress("Deriving keys...", 40);
    const keypairResult = await deriveKeypairFromMnemonic(mnemonic, APP_VARIANT, 0);
    if (keypairResult.isErr()) {
      return err(keypairResult.error);
    }
    const { public_key: key } = keypairResult.value;
    log.d("key", [key]);

    updateProgress("Fetching backup...", 55);
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

    updateProgress("Downloading backup...", 70);
    const responseResult = await ResultAsync.fromPromise(
      ky.get(download_url).text(),
      (e) => e as Error,
    );
    if (responseResult.isErr()) {
      return err(responseResult.error);
    }

    const encryptedData = responseResult.value;
    log.d("Downloaded data length:", [encryptedData.length]);

    updateProgress("Restoring wallet...", 85);
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
  try {
    updateProgress("Starting restore...", 0);
    const backupService = new BackupService();
    const restoreResult = await backupService.restoreBackup(mnemonic);

    if (restoreResult.isErr()) {
      return err(restoreResult.error);
    }

    updateProgress("Finalizing...", 90);
    const setMnemonicResult = await ResultAsync.fromPromise(
      setMnemonic(mnemonic),
      (e) => e as Error,
    );

    if (setMnemonicResult.isErr()) {
      return err(setMnemonicResult.error);
    }

    if (!hasGooglePlayServices()) {
      const storeNativeResult = await ResultAsync.fromPromise(
        storeNativeMnemonic(mnemonic),
        (e) => e as Error,
      );
      if (storeNativeResult.isErr()) {
        return err(storeNativeResult.error);
      }
    }

    updateProgress("Loading wallet...", 95);
    const loadWalletResult = await ResultAsync.fromPromise(loadWalletIfNeeded(), (e) => e as Error);

    if (loadWalletResult.isErr()) {
      return err(loadWalletResult.error);
    }

    updateProgress("Complete", 100);
    useWalletStore.setState({ isInitialized: true, isWalletLoaded: true, restoreProgress: null });

    return ok(undefined);
  } finally {
    useWalletStore.getState().setRestoreProgress(null);
  }
};
