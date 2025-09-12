import { Pressable, ScrollView, View } from "react-native";
import { useWalletStore, type WalletConfig } from "../store/walletStore";
import { useServerStore } from "../store/serverStore";
import { APP_VARIANT } from "../config";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Text } from "../components/ui/text";
import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList, SettingsStackParamList } from "../Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { useDeleteWallet } from "../hooks/useWallet";
import { useExportDatabase } from "../hooks/useExportDatabase";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { copyToClipboard } from "../lib/clipboardUtils";
import { ConfirmationDialog, DangerZoneRow } from "../components/ConfirmationDialog";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react-native";
import { BackupStatusCard } from "../components/BackupStatusCard";
import { usePeakKeyPair } from "~/hooks/useCrypto";

type Setting = {
  id:
    | keyof WalletConfig
    | "showMnemonic"
    | "showLogs"
    | "staticVtxoPubkey"
    | "resetRegistration"
    | "backup";
  title: string;
  value?: string;
  isPressable: boolean;
};

const CopyableSettingRow = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await copyToClipboard(value, {
      onCopy: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      },
    });
  };

  return (
    <Pressable onPress={onCopy} className="p-4 border-b border-border bg-card rounded-lg mb-2">
      <Label className="text-foreground text-lg">{label}</Label>
      <Text className={`text-base mt-1 text-muted-foreground`}>{copied ? "Copied!" : value}</Text>
    </Pressable>
  );
};

const SettingsScreen = () => {
  const [confirmText, setConfirmText] = useState("");
  const { config, isInitialized } = useWalletStore();
  const { lightningAddress, resetRegistration } = useServerStore();
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  const deleteWalletMutation = useDeleteWallet();
  const { isExporting, showExportSuccess, showExportError, exportError, exportDatabase } =
    useExportDatabase();
  const { data: peakKeyPair } = usePeakKeyPair();

  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList & OnboardingStackParamList>>();

  const handlePress = (item: Setting) => {
    if (!item.isPressable) return;

    if (item.id === "showMnemonic") {
      navigation.navigate("Mnemonic", { fromOnboarding: false });
    } else if (item.id === "showLogs") {
      navigation.navigate("Logs");
    } else if (item.id === "resetRegistration") {
      // This is handled by the AlertDialog now
    } else if (item.id === "backup") {
      navigation.navigate("BackupSettings");
    }
  };

  const data: Setting[] = [];

  if (isInitialized && peakKeyPair?.public_key) {
    data.push({
      id: "staticVtxoPubkey",
      title: "Public Key",
      value: peakKeyPair.public_key,
      isPressable: false,
    });
  }

  if (APP_VARIANT === "regtest") {
    data.push(
      {
        id: "bitcoind",
        title: "Bitcoind RPC",
        value: config.bitcoind,
        isPressable: false,
      },
      { id: "ark", title: "Ark Server", value: config.ark, isPressable: false },
    );
  } else {
    data.push(
      {
        id: "esplora",
        title: "Esplora Server",
        value: config.esplora,
        isPressable: false,
      },
      { id: "ark", title: "Ark Server", value: config.ark, isPressable: false },
    );
  }

  if (isInitialized) {
    data.push({ id: "showMnemonic", title: "Show Mnemonic", isPressable: true });
    data.push({ id: "showLogs", title: "Show Logs", isPressable: true });
    data.push({
      id: "resetRegistration",
      title: "Reset Server Registration",
      isPressable: true,
    });
    data.push({ id: "backup", title: "Backup & Restore", isPressable: true });
  }

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Settings</Text>
        </View>
        {showResetSuccess && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>Server registration has been reset.</AlertDescription>
          </Alert>
        )}
        {showExportSuccess && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Export Complete!</AlertTitle>
            <AlertDescription>Database has been exported successfully.</AlertDescription>
          </Alert>
        )}
        {showExportError && (
          <Alert icon={AlertTriangle} variant="destructive" className="mb-4">
            <AlertTitle>Export Failed!</AlertTitle>
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        <ScrollView className="flex-1 mb-16">
          <BackupStatusCard />
          {lightningAddress && (
            <Pressable
              onPress={() => navigation.navigate("LightningAddress", { fromOnboarding: false })}
              className="p-4 border-b border-border bg-card rounded-lg mb-2 flex-row justify-between items-center"
            >
              <View>
                <Label className="text-foreground text-lg">Lightning Address</Label>
                <Text className="text-base mt-1 text-muted-foreground">{lightningAddress}</Text>
              </View>
              <Icon name="chevron-forward-outline" size={24} color="white" />
            </Pressable>
          )}

          {data.map((item) => {
            if (item.id === "staticVtxoPubkey") {
              return <CopyableSettingRow key={item.id} label={item.title} value={item.value!} />;
            }
            if (item.id === "resetRegistration") {
              return (
                <ConfirmationDialog
                  key={item.id}
                  trigger={
                    <DangerZoneRow
                      title={item.title}
                      isPressable={item.isPressable}
                      onPress={() => {}}
                    />
                  }
                  title="Reset Server Registration"
                  description="Are you sure you want to reset your server registration? This will not delete your wallet, but you will need to register with the server again."
                  onConfirm={() => {
                    resetRegistration();
                    setShowResetSuccess(true);
                    setTimeout(() => {
                      setShowResetSuccess(false);
                    }, 3000);
                  }}
                />
              );
            }
            return (
              <Pressable
                key={item.id}
                onPress={() => handlePress(item)}
                disabled={!item.isPressable}
                className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-2"
              >
                <View>
                  <Label className="text-foreground text-lg">{item.title}</Label>
                  {item.value && (
                    <Text className="text-muted-foreground text-base mt-1">{item.value}</Text>
                  )}
                </View>
                {item.isPressable && (
                  <Icon name="chevron-forward-outline" size={24} color="white" />
                )}
              </Pressable>
            );
          })}
          {isInitialized && (
            <View className="mt-4">
              <Text className="text-lg font-bold text-destructive mb-4">Danger Zone</Text>

              <ConfirmationDialog
                trigger={
                  <Button variant="outline" disabled={isExporting} className="mb-4">
                    <Text>{isExporting ? "Exporting..." : "Export Database"}</Text>
                  </Button>
                }
                title="Export Database"
                description="This will create an encrypted backup file containing your wallet's databases. Keep this file secure, as it can be used to restore your wallet."
                onConfirm={exportDatabase}
                confirmText="Export"
                confirmVariant="default"
              />

              <ConfirmationDialog
                trigger={
                  <Button variant="destructive">
                    <Text>Delete Wallet</Text>
                  </Button>
                }
                title="Delete Wallet"
                description={`This action is irreversible. To confirm, please type "delete" in the box below.`}
                onConfirm={() => {
                  if (confirmText.toLowerCase() === "delete") {
                    deleteWalletMutation.mutate();
                  }
                }}
                isConfirmDisabled={confirmText.toLowerCase() !== "delete"}
              >
                <Input
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder='Type "delete" to confirm'
                  className="h-12"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ConfirmationDialog>
            </View>
          )}
        </ScrollView>
      </View>
    </NoahSafeAreaView>
  );
};

export default SettingsScreen;
