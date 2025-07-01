import React from "react";
import { View } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useWalletStore } from "../store/walletStore";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Text } from "../components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/constants";

const EditSettingScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { item } = route.params as {
    item: { id: string; title: string; value?: string };
  };
  const { config, setConfig } = useWalletStore();
  const [value, setValue] = React.useState(item.value);

  const handleSave = () => {
    setConfig({ ...config, [item.id]: value });
    navigation.goBack();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <Text className="text-2xl font-bold text-foreground mb-8">Edit {item.title}</Text>
        <View className="mb-4">
          <Input
            value={value}
            onChangeText={setValue}
            className="border-border bg-card p-4 rounded-lg text-foreground"
          />
        </View>
        <Button
          onPress={handleSave}
          className="mt-8"
          style={{ backgroundColor: COLORS.BITCOIN_ORANGE }}
        >
          <Text>Save</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
};

export default EditSettingScreen;
