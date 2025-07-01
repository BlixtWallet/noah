import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Button } from "../components/ui/button";
import { Text } from "../components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/constants";
import { useCreateWallet } from "../hooks/useWallet";

const OnboardingScreen = () => {
  const { mutate: createWallet, isPending } = useCreateWallet();

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background p-5">
      <Text className="text-3xl font-bold mb-4 text-center">Welcome to Noah</Text>
      <Text className="text-lg text-muted-foreground mb-10 text-center">
        Tap the button below to create your secure Bitcoin wallet.
      </Text>
      {isPending ? (
        <View className="items-center">
          <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          <Text className="mt-4 text-muted-foreground">Creating your wallet...</Text>
        </View>
      ) : (
        <Button
          onPress={() => createWallet()}
          size="lg"
          style={{ backgroundColor: COLORS.BITCOIN_ORANGE }}
        >
          <Text>Create Wallet</Text>
        </Button>
      )}
    </SafeAreaView>
  );
};

export default OnboardingScreen;
