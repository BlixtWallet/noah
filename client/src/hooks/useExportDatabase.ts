import { useState } from "react";
import { zipDirectory } from "noah-tools";
import Share from "react-native-share";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { ResultAsync } from "neverthrow";
import { ARK_DATA_PATH } from "~/constants";

export const useExportDatabase = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const exportDatabase = async () => {
    setIsExporting(true);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").split("T")[0];
    const timeComponent = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split(".")[0];
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `noah_database_export_${timestamp}_${timeComponent}_${randomId}.zip`;
    const outputPath = `${RNFS.CachesDirectoryPath}/${filename}`;

    // Create zip file using the native zipDirectory method
    const zipResult = await ResultAsync.fromPromise(
      zipDirectory(ARK_DATA_PATH, outputPath),
      (e) => e as Error,
    );

    if (zipResult.isErr()) {
      console.error("Error creating zip file:", zipResult.error);
      setIsExporting(false);
      return;
    }

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
    exportDatabase,
  };
};
