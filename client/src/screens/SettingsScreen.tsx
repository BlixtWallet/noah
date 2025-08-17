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
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Clipboard from "@react-native-clipboard/clipboard";
import { ConfirmationDialog, DangerZoneRow } from "../components/ConfirmationDialog";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { CheckCircle } from "lucide-react-native";

type Setting = {
  id: keyof WalletConfig | "showMnemonic" | "showLogs" | "staticVtxoPubkey" | "resetRegistration";
  title: string;
  value?: string;
  isPressable: boolean;
};

const CopyableSettingRow = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
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
    } else {
      navigation.navigate("EditConfiguration", {
        item: item as { id: keyof WalletConfig; title: string; value?: string },
      });
    }
  };

  const data: Setting[] = [];

  if (isInitialized && config.staticVtxoPubkey) {
    data.push({
      id: "staticVtxoPubkey",
      title: "Public Key",
      value: config.staticVtxoPubkey,
      isPressable: false,
    });
  }

  if (APP_VARIANT === "regtest") {
    data.push(
      {
        id: "bitcoind",
        title: "Bitcoind RPC",
        value: config.bitcoind,
        isPressable: !isInitialized,
      },
      { id: "asp", title: "ASP URL", value: config.asp, isPressable: !isInitialized },
      {
        id: "bitcoind_user",
        title: "RPC User",
        value: config.bitcoind_user,
        isPressable: !isInitialized,
      },
      {
        id: "bitcoind_pass",
        title: "RPC Pass",
        value: config.bitcoind_pass,
        isPressable: !isInitialized,
      },
    );
  } else {
    data.push(
      {
        id: "esplora",
        title: "Esplora URL",
        value: config.esplora,
        isPressable: !isInitialized,
      },
      { id: "asp", title: "ASP URL", value: config.asp, isPressable: !isInitialized },
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
        <ScrollView className="flex-1 mb-16">
          {lightningAddress && (
            <Pressable
              onPress={() => navigation.navigate("LightningAddress")}
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
