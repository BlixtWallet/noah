import React from "react";
import { View, Switch, ScrollView } from "react-native";
import { useBackupManager } from "../hooks/useBackupManager";
import { NoahSafeAreaView } from "../components/NoahSafeAreaView";
import { Text } from "../components/ui/text";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";

export const BackupSettingsScreen = () => {
  const {
    isBackupEnabled,
    setBackupEnabled,
    triggerBackup,
    listBackups,
    restoreBackup,
    deleteBackup,
  } = useBackupManager();

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 flex-1">
        <Text className="text-2xl font-bold text-foreground mb-4">Backup & Restore</Text>
        <Text className="text-muted-foreground mb-8">
          Backups are encrypted with your seed phrase and stored securely on our servers. We can
          never access your funds or data.
        </Text>

        <View className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-4">
          <Label className="text-foreground text-lg">Enable Automatic Backups</Label>
          <Switch value={isBackupEnabled} onValueChange={setBackupEnabled} />
        </View>

        <Button onPress={() => triggerBackup()} className="mb-4">
          <Text>Backup Now</Text>
        </Button>

        <View className="mt-8">
          <Button
            variant="outline"
            onPress={async () => {
              const backups = await listBackups();
              console.log(backups);
            }}
            className="mb-4"
          >
            <Text>List Backups</Text>
          </Button>
          <Button variant="outline" onPress={() => restoreBackup()} className="mb-4">
            <Text>Restore Latest Backup</Text>
          </Button>
          <Button variant="destructive" onPress={() => deleteBackup(1)}>
            <Text>Delete Backup v1</Text>
          </Button>
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};
