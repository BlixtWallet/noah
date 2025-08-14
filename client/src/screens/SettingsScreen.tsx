import { Pressable, ScrollView, View } from "react-native";
import { useWalletStore, type WalletConfig } from "../store/walletStore";
import { useServerStore } from "../store/serverStore";
import { APP_VARIANT } from "../config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
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
  const { resetRegistration } = useServerStore();
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
      resetRegistration();
      // TODO: Add toast notification
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
        <ScrollView className="flex-1 mb-16">
          {data.map((item) => {
            if (item.id === "staticVtxoPubkey") {
              return <CopyableSettingRow key={item.id} label={item.title} value={item.value!} />;
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
              <AlertDialog onOpenChange={() => setConfirmText("")}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Text>Delete Wallet</Text>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
                    <AlertDialogDescription>
                      {`This action is irreversible. To confirm, please type "delete" in the box
below.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={confirmText}
                    onChangeText={setConfirmText}
                    placeholder='Type "delete" to confirm'
                    className="h-12"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <AlertDialogFooter className="flex-row space-x-2">
                    <AlertDialogCancel className="flex-1">
                      <Text>Cancel</Text>
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={confirmText.toLowerCase() !== "delete"}
                      onPress={() => deleteWalletMutation.mutate()}
                      className="flex-1"
                    >
                      <Text>Delete</Text>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </View>
          )}
        </ScrollView>
      </View>
    </NoahSafeAreaView>
  );
};

export default SettingsScreen;
