import React, { useState } from "react";
import { View, Switch, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useBackupManager } from "../hooks/useBackupManager";
import { NoahSafeAreaView } from "../components/NoahSafeAreaView";
import { Text } from "../components/ui/text";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { CheckCircle } from "lucide-react-native";
import Icon from "@react-native-vector-icons/ionicons";

export const BackupSettingsScreen = () => {
  const navigation = useNavigation();
  const {
    isBackupEnabled,
    setBackupEnabled,
    triggerBackup,
    listBackups,
    restoreBackup,
    deleteBackup,
    isLoading,
    backupsList,
  } = useBackupManager();

  const [showBackups, setShowBackups] = useState(false);
  const [showBackupSuccess, setShowBackupSuccess] = useState(false);
  const [showRestoreSuccess, setShowRestoreSuccess] = useState(false);

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Backup & Restore</Text>
        </View>
        <Text className="text-muted-foreground mb-8">
          Backups are encrypted with your seed phrase and stored securely on our servers. We can
          never access your funds or data.
        </Text>

        <View className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-4">
          <Label className="text-foreground text-lg">Enable Automatic Backups</Label>
          <View className="flex-row items-center">
            {isLoading && <ActivityIndicator size="small" className="mr-2" />}
            <Switch value={isBackupEnabled} onValueChange={setBackupEnabled} disabled={isLoading} />
          </View>
        </View>

        <Button
          onPress={async () => {
            const result = await triggerBackup();
            if (result.isOk()) {
              setShowBackupSuccess(true);
              setTimeout(() => {
                setShowBackupSuccess(false);
              }, 3000);
            }
          }}
          className="mb-4"
          disabled={isLoading}
        >
          {isLoading ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="white" className="mr-2" />
              <Text>Backing up...</Text>
            </View>
          ) : (
            <Text>Backup Now</Text>
          )}
        </Button>

        {showBackupSuccess && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Backup Complete!</AlertTitle>
            <AlertDescription>Your wallet has been backed up successfully.</AlertDescription>
          </Alert>
        )}

        {showRestoreSuccess && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Restore Complete!</AlertTitle>
            <AlertDescription>Your wallet has been restored successfully.</AlertDescription>
          </Alert>
        )}

        <View className="mt-8">
          <Button
            variant="outline"
            onPress={async () => {
              const result = await listBackups();
              if (result.isOk()) {
                setShowBackups(true);
              }
            }}
            className="mb-4"
            disabled={isLoading}
          >
            {isLoading ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" className="mr-2" />
                <Text>Loading...</Text>
              </View>
            ) : (
              <Text>List Backups</Text>
            )}
          </Button>

          {showBackups && backupsList && (
            <View className="mb-4 p-4 bg-card rounded-lg border border-border">
              <Text className="text-lg font-semibold mb-2">Available Backups</Text>
              {backupsList.length === 0 ? (
                <Text className="text-muted-foreground">No backups found</Text>
              ) : (
                backupsList.map((backup) => (
                  <View
                    key={backup.backup_version}
                    className="flex-row justify-between items-center py-2 border-b border-border"
                  >
                    <View>
                      <Text className="font-medium">Version {backup.backup_version}</Text>
                      <Text className="text-sm text-muted-foreground">
                        {new Date(backup.created_at).toLocaleDateString()} -{" "}
                        {(backup.backup_size / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={async () => {
                          const result = await restoreBackup(backup.backup_version);
                          if (result.isOk()) {
                            setShowRestoreSuccess(true);
                            setTimeout(() => {
                              setShowRestoreSuccess(false);
                            }, 3000);
                          }
                        }}
                        disabled={isLoading}
                      >
                        <Text>Restore</Text>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onPress={() => deleteBackup(backup.backup_version)}
                        disabled={isLoading}
                      >
                        <Text>Delete</Text>
                      </Button>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          <Button
            variant="outline"
            onPress={async () => {
              const result = await restoreBackup();
              if (result.isOk()) {
                setShowRestoreSuccess(true);
                setTimeout(() => {
                  setShowRestoreSuccess(false);
                }, 3000);
              }
            }}
            className="mb-4"
            disabled={isLoading}
          >
            {isLoading ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" className="mr-2" />
                <Text>Restoring...</Text>
              </View>
            ) : (
              <Text>Restore Latest Backup</Text>
            )}
          </Button>
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};
