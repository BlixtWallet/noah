import { View, Pressable } from "react-native";
import { useWalletStore, type WalletConfig } from "../store/walletStore";
import { APP_VARIANT } from "../config";
import { Text } from "../components/ui/text";
import { Label } from "../components/ui/label";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LegendList } from "@legendapp/list";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "../../App";
import Icon from "@react-native-vector-icons/ionicons";

type EditableSetting = {
  id: keyof WalletConfig;
  title: string;
  value?: string;
};

const SettingsScreen = () => {
  const { config } = useWalletStore();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const handlePress = (item: EditableSetting) => {
    navigation.navigate("EditSetting", { item });
  };

  const data: EditableSetting[] =
    APP_VARIANT === "regtest"
      ? [
          { id: "bitcoind", title: "Bitcoind RPC", value: config.bitcoind },
          { id: "asp", title: "ASP URL", value: config.asp },
          {
            id: "bitcoind_user",
            title: "RPC User",
            value: config.bitcoind_user,
          },
          {
            id: "bitcoind_pass",
            title: "RPC Pass",
            value: config.bitcoind_pass,
          },
        ]
      : [
          { id: "esplora", title: "Esplora URL", value: config.esplora },
          { id: "asp", title: "ASP URL", value: config.asp },
        ];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <Text className="text-2xl font-bold text-foreground mb-4">Settings</Text>
        <LegendList
          data={data}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-2"
            >
              <View>
                <Label className="text-foreground text-lg">{item.title}</Label>
                <Text className="text-muted-foreground text-base mt-1">{item.value}</Text>
              </View>
              <Icon name="chevron-forward-outline" size={24} color="white" />
            </Pressable>
          )}
          keyExtractor={(item) => item.id}
          recycleItems
        />
      </View>
    </SafeAreaView>
  );
};

export default SettingsScreen;
