import { Redirect } from "expo-router";
import { useWalletStore } from "~/store/walletStore";
import { View, Text } from "react-native";
import { NoahActivityIndicator } from "~/components/ui/NoahActivityIndicator";
import { useEffect, useState } from "react";
import { getMnemonic } from "~/lib/crypto";

export default function Index() {
  const { isInitialized, finishOnboarding } = useWalletStore();
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);

  useEffect(() => {
    const checkExistingWallet = async () => {
      if (isInitialized) {
        setIsCheckingWallet(false);
        return;
      }

      const mnemonicResult = await getMnemonic();
      if (mnemonicResult.isOk() && mnemonicResult.value) {
        finishOnboarding();
      }
      setIsCheckingWallet(false);
    };

    checkExistingWallet();
  }, [isInitialized, finishOnboarding]);

  if (isCheckingWallet) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <NoahActivityIndicator size="large" />
        <Text style={{ marginTop: 10, color: "white" }}>Loading...</Text>
      </View>
    );
  }

  // Redirect based on initialization status
  if (isInitialized) {
    return <Redirect href="/(tabs)/(home)" />;
  } else {
    return <Redirect href="/(onboarding)" />;
  }
}
