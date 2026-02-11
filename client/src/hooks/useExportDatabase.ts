import { useState } from "react";
import Share from "react-native-share";
import RNFSTurbo from "react-native-fs-turbo";
import { ResultAsync } from "neverthrow";
import { CACHES_DIRECTORY_PATH } from "~/constants";
import { createBackup } from "noah-tools";
import { getMnemonic } from "~/lib/crypto";
import logger from "~/lib/log";

const log = logger("useExportDatabase");

export const useExportDatabase = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [showExportError, setShowExportError] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportDatabase = async () => {
    setIsExporting(true);

    const mnemonicResult = await getMnemonic();
    if (mnemonicResult.isErr()) {
      setExportError("Could not retrieve seed phrase/password to encrypt backup.");
      setShowExportError(true);
      setIsExporting(false);
      return;
    }

    const backupResult = await ResultAsync.fromPromise(
      createBackup(mnemonicResult.value),
      (e) => e as Error,
    );

    if (backupResult.isErr()) {
      log.e("Error creating backup:", [backupResult.error]);
      setExportError("Failed to create backup file. Please try again.");
      setShowExportError(true);
      setIsExporting(false);
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").split("T")[0];
    const filename = `noah_backup_${timestamp}.txt`;
    const outputPath = `${CACHES_DIRECTORY_PATH}/${filename}`;

    const writeResult = await ResultAsync.fromPromise(
      new Promise<void>((resolve, reject) => {
        try {
          RNFSTurbo.writeFile(outputPath, backupResult.value, "base64");
          resolve();
        } catch (e) {
          reject(e);
        }
      }),
      (e) => e as Error,
    );

    if (writeResult.isErr()) {
      log.e("Error writing backup file:", [writeResult.error]);
      setExportError("Failed to save backup file. Please try again.");
      setShowExportError(true);
      setIsExporting(false);
      return;
    }

    const shareResult = await ResultAsync.fromPromise(
      Share.open({
        title: "Export Encrypted Backup",
        url: `file://${outputPath}`,
        type: "text/plain",
        filename: filename,
        subject: "Noah Wallet Encrypted Backup",
      }),
      (e) => e as Error,
    );

    if (shareResult.isErr()) {
      if (!shareResult.error.message.includes("User did not share")) {
        log.e("Error sharing backup file:", [shareResult.error]);
        setExportError("Failed to share the backup file. Please try again.");
        setShowExportError(true);
      }
    } else {
      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 3000);
    }

    await RNFSTurbo.unlink(outputPath);
    setIsExporting(false);
  };

  return {
    isExporting,
    showExportSuccess,
    showExportError,
    exportError,
    exportDatabase,
  };
};
