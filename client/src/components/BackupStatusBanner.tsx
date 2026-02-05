import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { AlertCircle, CheckCircle, CloudUpload } from "lucide-react-native";
import { Text } from "~/components/ui/text";
import { NoahButton } from "~/components/ui/NoahButton";
import { NoahActivityIndicator } from "~/components/ui/NoahActivityIndicator";
import { useBackupStore } from "~/store/backupStore";
import { useServerStore } from "~/store/serverStore";
import {
  AUTO_BACKUP_FRESHNESS_MS,
  AUTO_BACKUP_SUCCESS_BANNER_MS,
} from "~/constants";
import { BackupService } from "~/lib/backupService";
import logger from "~/lib/log";
import { redactSensitiveErrorMessage } from "~/lib/errorUtils";

const log = logger("BackupStatusBanner");

export const BackupStatusBanner: React.FC = () => {
  const { isBackupEnabled } = useServerStore();
  const { lastBackupAt, lastBackupStatus, lastBackupError } = useBackupStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!lastBackupAt) {
      return undefined;
    }

    const now = Date.now();
    const successExpiresAt =
      lastBackupStatus === "success"
        ? lastBackupAt + AUTO_BACKUP_SUCCESS_BANNER_MS
        : null;
    const staleAt = lastBackupAt + AUTO_BACKUP_FRESHNESS_MS;

    let nextAt: number | null = null;
    if (successExpiresAt !== null && now < successExpiresAt) {
      nextAt = successExpiresAt;
    }

    if (now < staleAt) {
      nextAt = nextAt === null ? staleAt : Math.min(nextAt, staleAt);
    }

    if (nextAt === null) {
      return undefined;
    }

    const delayMs = Math.max(0, nextAt - now);
    const timeoutId = setTimeout(() => {
      setTick((value) => value + 1);
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [lastBackupAt, lastBackupStatus, tick]);

  const now = Date.now();
  const isStale = !lastBackupAt || now - lastBackupAt > AUTO_BACKUP_FRESHNESS_MS;
  const showSuccess =
    lastBackupStatus === "success" &&
    lastBackupAt !== null &&
    now - lastBackupAt < AUTO_BACKUP_SUCCESS_BANNER_MS;
  const showInProgress = lastBackupStatus === "in_progress";
  const showFailed = lastBackupStatus === "failed";
  const showStale = !showInProgress && !showFailed && isStale;

  const { title, message, icon } = (() => {
    if (showInProgress) {
      return {
        title: "Backing up your wallet",
        message: "This runs in the background. You can keep using the app.",
        icon: <CloudUpload size={20} color="#60a5fa" />,
      };
    }

    if (showFailed) {
      return {
        title: "Backup failed",
        message: lastBackupError ?? "An unknown error occurred while backing up.",
        icon: <AlertCircle size={20} color="#ef4444" />,
      };
    }

    if (showSuccess) {
      return {
        title: "Backup completed",
        message: "Your wallet has been backed up successfully.",
        icon: <CheckCircle size={20} color="#22c55e" />,
      };
    }

    const isFirstBackup = !lastBackupAt;
    return {
      title: isFirstBackup ? "Backup pending" : "Backup recommended",
      message: isFirstBackup
        ? "We haven't backed up this wallet yet. We'll do it in the background."
        : "Your last backup is older than our freshness window.",
      icon: <CloudUpload size={20} color="#60a5fa" />,
    };
  })();

  if (!isBackupEnabled && lastBackupStatus === "idle" && !lastBackupAt) {
    return null;
  }

  if (!showSuccess && !showInProgress && !showFailed && !showStale) {
    return null;
  }

  const handleBackupNow = async () => {
    setIsRetrying(true);
    const backupService = new BackupService();
    const result = await backupService.performBackup();
    if (result.isErr()) {
      log.w("Manual backup failed", [redactSensitiveErrorMessage(result.error)]);
    }
    setIsRetrying(false);
  };

  return (
    <View className="mx-4 mt-4 mb-2">
      <View className="bg-card border border-border rounded-xl p-4">
        <View className="flex-row items-center gap-2 mb-2">
          {icon}
          <Text className="text-base font-semibold text-foreground">{title}</Text>
        </View>
        <Text className="text-sm text-muted-foreground">{message}</Text>
        {lastBackupAt && (showSuccess || showStale) && (
          <Text className="text-xs text-muted-foreground mt-2">
            Last backup: {new Date(lastBackupAt).toLocaleString()}
          </Text>
        )}
        {showInProgress && (
          <View className="flex-row items-center gap-2 mt-3">
            <NoahActivityIndicator size="small" />
            <Text className="text-xs text-muted-foreground">Running in the background...</Text>
          </View>
        )}
        {(showFailed || showStale) && (
          <View className="mt-3">
            <NoahButton onPress={handleBackupNow} disabled={isRetrying}>
              <Text>{showFailed ? "Retry Backup" : "Backup Now"}</Text>
            </NoahButton>
          </View>
        )}
      </View>
    </View>
  );
};
