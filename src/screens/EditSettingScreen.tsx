import React from "react";
import { View, Pressable } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useWalletStore } from "../store/walletStore";
import { Input } from "../components/ui/input";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import type { OnboardingStackParamList } from "../Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";

const EditSettingScreen = () => {
  const route = useRoute<RouteProp<OnboardingStackParamList, "EditConfiguration">>();
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { item } = route.params;
  const { config, setConfig } = useWalletStore();
  const [value, setValue] = React.useState(item.value);

  const handleSave = () => {
    setConfig({ ...config, [item.id]: value });
    navigation.goBack();
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Edit {item.title}</Text>
        </View>
        <View className="mb-4">
          <Input
            value={value}
            onChangeText={setValue}
            className="border-border bg-card p-4 rounded-lg text-foreground"
          />
        </View>
        <NoahButton onPress={handleSave} className="mt-8">
          Save
        </NoahButton>
      </View>
    </NoahSafeAreaView>
  );
};

export default EditSettingScreen;
