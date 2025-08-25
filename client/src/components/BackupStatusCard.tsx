import React from "react";
import { View, Text } from "react-native";
import { useBackupManager } from "../hooks/useBackupManager";

export const BackupStatusCard = () => {
  const { isBackupEnabled } = useBackupManager();

  return (
    <View>
      <Text>Backup Status</Text>
      <Text>Automatic backups are {isBackupEnabled ? "enabled" : "disabled"}</Text>
    </View>
  );
};
