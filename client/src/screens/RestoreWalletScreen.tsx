import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { type NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingStackParamList } from "../Navigators";
import { NoahButton } from "../components/ui/NoahButton";
import { useWalletStore } from "~/store/walletStore";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { Text } from "~/components/ui/text";

type Props = NativeStackScreenProps<OnboardingStackParamList, "RestoreWallet">;

const RestoreWalletScreen = ({ navigation }: Props) => {
  const [seedPhrase, setSeedPhrase] = useState("");
  const { restoreWallet } = useWalletStore();

  const handleRestore = async () => {
    if (seedPhrase) {
      await restoreWallet(seedPhrase);
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background justify-center items-center p-4">
      <View className="flex-1 justify-center items-center w-full">
        <Text className="text-3xl font-bold mb-4 text-center">Restore Wallet</Text>
        <Text className="text-lg text-muted-foreground mb-10 text-center">
          Enter your 12-word seed phrase to restore your wallet.
        </Text>
        <TextInput
          className="w-full h-24 bg-input rounded-lg p-4 text-foreground text-lg text-left"
          placeholder="Enter your seed phrase"
          value={seedPhrase}
          onChangeText={setSeedPhrase}
          multiline
        />
        <View className="h-5" />
        <NoahButton onPress={handleRestore}>Restore</NoahButton>
      </View>
    </NoahSafeAreaView>
  );
};

export default RestoreWalletScreen;
