import { Pressable, ScrollView, View, Switch, Image } from "react-native";
import Constants from "expo-constants";
import { useWalletStore } from "../store/walletStore";
import { ACTIVE_WALLET_CONFIG } from "../constants";
import { useServerStore } from "../store/serverStore";
import { useTransactionStore } from "../store/transactionStore";
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
import { usePeakKeyPair } from "~/hooks/useCrypto";
import logoImage from "../../assets/All_Files/all_sizes/1024.png";
import { COLORS } from "~/lib/styleConstants";

type Setting = {
  id:
    | "bitcoind"
    | "ark"
    | "esplora"
    | "showMnemonic"
    | "showLogs"
    | "staticVtxoPubkey"
    | "resetRegistration"
    | "backup"
    | "vtxos";
  title: string;
  value?: string;
  description?: string;
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
  const { isInitialized } = useWalletStore();
  const { lightningAddress, resetRegistration } = useServerStore();
  const { isAutoBoardingEnabled, setAutoBoardingEnabled } = useTransactionStore();
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
    } else if (item.id === "vtxos") {
      navigation.navigate("VTXOs");
    }
  };

  const infoData: Setting[] = [];
  const walletData: Setting[] = [];
  const debugData: Setting[] = [];

  if (isInitialized && peakKeyPair?.public_key) {
    infoData.push({
      id: "staticVtxoPubkey",
      title: "Public Key",
      value: peakKeyPair.public_key,
      isPressable: false,
    });
  }

  if (APP_VARIANT === "regtest") {
    infoData.push(
      {
        id: "bitcoind",
        title: "Bitcoind RPC",
        value: ACTIVE_WALLET_CONFIG.config?.bitcoind,
        isPressable: false,
      },
      {
        id: "ark",
        title: "Ark Server",
        value: ACTIVE_WALLET_CONFIG.config?.ark,
        isPressable: false,
      },
    );
  } else {
    infoData.push(
      {
        id: "esplora",
        title: "Esplora Server",
        value: ACTIVE_WALLET_CONFIG.config?.esplora,
        isPressable: false,
      },
      {
        id: "ark",
        title: "Ark Server",
        value: ACTIVE_WALLET_CONFIG.config?.ark,
        isPressable: false,
      },
    );
  }

  if (isInitialized) {
    walletData.push({
      id: "showMnemonic",
      title: "Show Seed Phrase",
      description:
        "Never share your seed phrase with anyone. It is important to keep it safe and secure.",
      isPressable: true,
    });
    walletData.push({
      id: "vtxos",
      title: "Show VTXOs",
      description: "VTXOs are to Ark like UTXOs are to Bitcoin",
      isPressable: true,
    });
    walletData.push({
      id: "backup",
      title: "Backup & Restore",
      description: "Automatically or manually backup your wallet after encrypting it.",
      isPressable: true,
    });

    debugData.push({
      id: "showLogs",
      title: "Show Logs",
      description: "View application logs for debugging purposes",
      isPressable: true,
    });
    debugData.push({
      id: "resetRegistration",
      title: "Reset Server Registration",
      description: "Clear your registration with the server. You will need to register again.",
      isPressable: true,
    });
  }

  const renderSettingItem = (item: Setting) => {
    if (
      item.id === "staticVtxoPubkey" ||
      item.id === "ark" ||
      item.id === "esplora" ||
      item.id === "bitcoind"
    ) {
      return <CopyableSettingRow key={item.id} label={item.title} value={item.value!} />;
    }

    if (item.id === "resetRegistration") {
      return (
        <ConfirmationDialog
          key={item.id}
          trigger={
            <DangerZoneRow
              title={item.title}
              description="Attempt to reset the connection with our server if you're experiencing issues."
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
        <View className="flex-1">
          <Label className="text-foreground text-lg">{item.title}</Label>
          {item.value && <Text className="text-muted-foreground text-base mt-1">{item.value}</Text>}
          {item.description && (
            <Text className="text-muted-foreground text-base mt-1">{item.description}</Text>
          )}
        </View>
        {item.isPressable && <Icon name="chevron-forward-outline" size={24} color="white" />}
      </Pressable>
    );
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background" style={{ paddingBottom: 0 }}>
      <View className="px-4 pt-4">
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
      </View>
      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View className="items-center mb-6">
          <Pressable onPress={() => navigation.navigate("NoahStory")}>
            <Image
              source={logoImage}
              style={{ width: 120, height: 120, borderRadius: 12 }}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        {(lightningAddress || infoData.length > 0) && (
          <View className="mb-6">
            <Text
              className="text-lg font-bold text-foreground mb-2"
              style={{ color: COLORS.BITCOIN_ORANGE }}
            >
              Info
            </Text>
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
            {infoData.map(renderSettingItem)}
          </View>
        )}

        {walletData.length > 0 && (
          <View className="mb-6">
            <Text
              className="text-lg font-bold text-foreground mb-2"
              style={{ color: COLORS.BITCOIN_ORANGE }}
            >
              Wallet
            </Text>
            {walletData.map(renderSettingItem)}
            <View className="p-4 border-b border-border bg-card rounded-lg mb-2 flex-row justify-between items-center">
              <View className="flex-1">
                <Label className="text-foreground text-lg">Auto-Board to Ark</Label>
                <Text className="text-base mt-1 text-muted-foreground">
                  Automatically board to Ark when onchain balance exceeds 20k sats
                </Text>
              </View>
              <Switch
                value={isAutoBoardingEnabled}
                onValueChange={setAutoBoardingEnabled}
                trackColor={{ false: "#767577", true: "#F7931A" }}
                thumbColor={isAutoBoardingEnabled ? "#ffffff" : "#f4f3f4"}
              />
            </View>
          </View>
        )}

        {debugData.length > 0 && (
          <View className="mb-6">
            <Text
              className="text-lg font-bold text-foreground mb-2"
              style={{ color: COLORS.BITCOIN_ORANGE }}
            >
              Debug
            </Text>
            {debugData.map(renderSettingItem)}
          </View>
        )}

        {isInitialized && (
          <View className="mb-6">
            <Text className="text-lg font-bold text-destructive mb-2">Danger Zone</Text>

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

        <View className="items-center py-8 px-4">
          <Text className="text-muted-foreground text-sm mb-1">
            v{Constants.expoConfig?.version || "0.0.1"}
          </Text>
          <Text className="text-muted-foreground text-sm">Made with ❤️ from Noah team</Text>
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default SettingsScreen;
