import React, { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import { useCreateWallet } from "../hooks/useWallet";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";

const OnboardingScreen = () => {
  const router = useRouter();
  const { mutate: createWallet, isPending, isSuccess } = useCreateWallet();

  useEffect(() => {
    if (isSuccess) {
      router.push("/(onboarding)/mnemonic?fromOnboarding=true");
    }
  }, [isSuccess, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background p-5">
      <Text className="text-3xl font-bold mb-4 text-center">Welcome to Noah</Text>
      <Text className="text-lg text-muted-foreground mb-10 text-center">
        Create a new wallet or restore an existing one.
      </Text>
      {isPending ? (
        <View className="items-center">
          <NoahActivityIndicator size="large" />
          <Text className="mt-4 text-muted-foreground">Creating your wallet...</Text>
        </View>
      ) : (
        <View className="flex-row">
          <NoahButton onPress={() => createWallet()} size="lg">
            Create Wallet
          </NoahButton>
          <View style={{ width: 20 }} />
          <NoahButton onPress={() => router.push("/(onboarding)/restore-wallet")} size="lg">
            Restore Wallet
          </NoahButton>
        </View>
      )}
    </View>
  );
};

export default OnboardingScreen;
