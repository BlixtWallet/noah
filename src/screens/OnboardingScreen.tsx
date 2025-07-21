import React from "react";
import { View, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "../Navigators";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import { COLORS } from "../lib/styleConstants";
import { useCreateWallet } from "../hooks/useWallet";

const OnboardingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { mutate: createWallet, isPending } = useCreateWallet();

  return (
    <View className="flex-1 items-center justify-center bg-background p-5">
      <Text className="text-3xl font-bold mb-4 text-center" id="welcome">
        Welcome to Noah
      </Text>
      <Text className="text-lg text-muted-foreground mb-10 text-center">
        Tap to create a wallet with default settings. Press and hold to customize.
      </Text>
      {isPending ? (
        <View className="items-center">
          <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          <Text className="mt-4 text-muted-foreground">Creating your wallet...</Text>
        </View>
      ) : (
        <NoahButton
          onPress={() => createWallet()}
          onLongPress={() => navigation.navigate("Configuration")}
          delayLongPress={200}
          size="lg"
        >
          Create Wallet
        </NoahButton>
      )}
    </View>
  );
};

export default OnboardingScreen;
