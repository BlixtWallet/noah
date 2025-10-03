import React, { useState } from "react";
import { View, Switch, ScrollView, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useBackupManager } from "../hooks/useBackupManager";
import { NoahSafeAreaView } from "../components/NoahSafeAreaView";
import { Text } from "../components/ui/text";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
import Icon from "@react-native-vector-icons/ionicons";
import { CheckCircle } from "lucide-react-native";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";
import { NoahButton } from "~/components/ui/NoahButton";
import * as Haptics from "expo-haptics";

export const BackupSettingsScreen = () => {
  const navigation = useNavigation();
  const {
    isBackupEnabled,
    setBackupEnabled,
    triggerBackup,
    listBackups,
    deleteBackup,
    isLoading,
    backupsList,
  } = useBackupManager();

  const [showBackups, setShowBackups] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Backup</Text>
        </View>
        <Text className="text-muted-foreground mb-8">
          Backups are encrypted with your seed phrase and stored securely on our servers. We can
          never access your funds or data.
        </Text>

        <View className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-4">
          <Label className="text-foreground text-lg">Enable Automatic Backups</Label>
          <Switch value={isBackupEnabled} onValueChange={setBackupEnabled} disabled={isLoading} />
        </View>

        {showSuccessAlert && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Backup Complete!</AlertTitle>
            <AlertDescription>Your wallet has been backed up successfully.</AlertDescription>
          </Alert>
        )}

        <NoahButton
          onPress={async () => {
            const result = await triggerBackup();
            if (result.isOk()) {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setShowSuccessAlert(true);
              setTimeout(() => setShowSuccessAlert(false), 3000);
            } else {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          }}
          className="mb-4"
          disabled={isLoading}
        >
          <Text>Backup Now</Text>
        </NoahButton>

        <View className="mt-8">
          <NoahButton
            variant="outline"
            onPress={async () => {
              const result = await listBackups();
              if (result.isOk()) {
                setShowBackups(true);
              }
            }}
            className="mb-8 border-gray-600"
            disabled={isLoading}
            style={{ backgroundColor: "black" }}
          >
            <Text>List Backups</Text>
          </NoahButton>

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
                        {new Date(backup.created_at).toLocaleString()} -{" "}
                        {(backup.backup_size / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
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
        </View>
      </ScrollView>

      {isLoading && (
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <View className="bg-card p-6 rounded-lg items-center">
            <NoahActivityIndicator size="large" />
            <Text className="text-foreground mt-4">Loading...</Text>
          </View>
        </View>
      )}
    </NoahSafeAreaView>
  );
};
