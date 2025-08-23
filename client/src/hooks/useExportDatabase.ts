import { useState } from "react";
import { zipDirectory } from "noah-tools";
import Share from "react-native-share";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { ResultAsync } from "neverthrow";
import { CACHES_DIRECTORY_PATH, DOCUMENT_DIRECTORY_PATH } from "~/constants";

export const useExportDatabase = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [showExportError, setShowExportError] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportDatabaseToZip = async () => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").split("T")[0];
    const timeComponent = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split(".")[0];
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `noah_database_export_${timestamp}_${timeComponent}_${randomId}.zip`;
    const outputPath = `${CACHES_DIRECTORY_PATH}/${filename}`;

    // Use DocumentDirectoryPath to include both noah-data-* and mmkv folders
    // Create zip file using the native zipDirectory method
    const zipResult = await ResultAsync.fromPromise(
      zipDirectory(DOCUMENT_DIRECTORY_PATH, outputPath),
      (e) => e as Error,
    );

    if (zipResult.isErr()) {
      console.error("Error creating zip file:", zipResult.error);
      setExportError("Failed to create zip file. Please try again.");
      setShowExportError(true);
      setTimeout(() => {
        setShowExportError(false);
        setExportError(null);
      }, 5000);
      return zipResult;
    }

    return zipResult.map(() => ({ outputPath, filename }));
  };

  const exportDatabase = async () => {
    setIsExporting(true);

    const zipResult = await exportDatabaseToZip();

    if (zipResult.isErr()) {
      setIsExporting(false);
      return;
    }

    const { outputPath, filename } = zipResult.value;

    // Share the zip file
    const shareResult = await ResultAsync.fromPromise(
      Share.open({
        title: "Export Database",
        url: `file://${outputPath}`,
        type: "application/zip",
        filename: filename,
        subject: "Noah Wallet Database Export",
      }),
      (e) => e as Error,
    );

    if (shareResult.isErr()) {
      if (!shareResult.error.message.includes("User did not share")) {
        console.error("Error sharing zip file:", shareResult.error);
        setExportError("Failed to share the export file. Please try again.");
        setShowExportError(true);
        setTimeout(() => {
          setShowExportError(false);
          setExportError(null);
        }, 5000);
      }
    } else {
      setShowExportSuccess(true);
      setTimeout(() => {
        setShowExportSuccess(false);
      }, 3000);
    }

    // Clean up the temporary file
    await ResultAsync.fromPromise(RNFS.unlink(outputPath), (e) => e as Error);

    setIsExporting(false);
  };

  return {
    isExporting,
    showExportSuccess,
    showExportError,
    exportError,
    exportDatabase,
    exportDatabaseToZip,
  };
};
