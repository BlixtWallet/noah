import { Pressable, View } from "react-native";
import { useWalletStore, type WalletConfig } from "../store/walletStore";
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
import { LegendList } from "@legendapp/list";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList, SettingsStackParamList } from "../Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { useDeleteWallet } from "../hooks/useWallet";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";

type Setting = {
  id: keyof WalletConfig | "showMnemonic" | "showLogs";
  title: string;
  value?: string;
  isPressable: boolean;
};

const SettingsScreen = () => {
  const [confirmText, setConfirmText] = useState("");
  const { config, isInitialized } = useWalletStore();
  const deleteWalletMutation = useDeleteWallet();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList & OnboardingStackParamList>>();

  const handlePress = (item: Setting) => {
    if (!item.isPressable) return;

    if (item.id === "showMnemonic") {
      navigation.navigate("Mnemonic", { fromOnboarding: false });
    } else if (item.id === "showLogs") {
      navigation.navigate("Logs");
    } else {
      navigation.navigate("EditConfiguration", {
        item: item as { id: keyof WalletConfig; title: string; value?: string },
      });
    }
  };

  const data: Setting[] =
    APP_VARIANT === "regtest"
      ? [
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
        ]
      : [
          {
            id: "esplora",
            title: "Esplora URL",
            value: config.esplora,
            isPressable: !isInitialized,
          },
          { id: "asp", title: "ASP URL", value: config.asp, isPressable: !isInitialized },
        ];

  if (isInitialized) {
    data.push({ id: "showMnemonic", title: "Show Mnemonic", isPressable: true });
    data.push({ id: "showLogs", title: "Show Logs", isPressable: true });
  }

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Settings</Text>
        </View>
        <LegendList
          data={data}
          renderItem={({ item }) => (
            <Pressable
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
              {item.isPressable && <Icon name="chevron-forward-outline" size={24} color="white" />}
            </Pressable>
          )}
          keyExtractor={(item) => item.id}
          recycleItems
        />

        {isInitialized && (
          <View className="mt-8">
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
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <Text>Cancel</Text>
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={confirmText.toLowerCase() !== "delete"}
                    onPress={() => deleteWalletMutation.mutate()}
                  >
                    <Text>Delete</Text>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </View>
        )}
      </View>
    </NoahSafeAreaView>
  );
};

export default SettingsScreen;
