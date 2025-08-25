import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { type NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingStackParamList } from "../Navigators";
import { NoahButton } from "../components/ui/NoahButton";
import { useRestoreWallet } from "~/hooks/useWallet";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { Text } from "~/components/ui/text";
import Icon from "@react-native-vector-icons/ionicons";

type Props = NativeStackScreenProps<OnboardingStackParamList, "RestoreWallet">;

const RestoreWalletScreen = ({ navigation }: Props) => {
  const [mnemonic, setMnemonic] = useState("");
  const { mutate: restoreWallet, isPending } = useRestoreWallet();

  const handleRestore = async () => {
    if (mnemonic) {
      restoreWallet(mnemonic.trim());
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Restore Wallet</Text>
        </View>
        <View className="flex-1 justify-center items-center w-full">
          <Text className="text-lg text-muted-foreground mb-10 text-center">
            Enter your 12-word seed phrase to restore your wallet.
          </Text>
          <TextInput
            className="w-full h-24 bg-input rounded-lg p-4 text-foreground text-lg text-left"
            placeholder="Enter your seed phrase"
            value={mnemonic}
            onChangeText={setMnemonic}
            multiline
          />
          <View className="h-5" />
          <NoahButton onPress={handleRestore} disabled={isPending}>
            {isPending ? "Restoring..." : "Restore"}
          </NoahButton>
        </View>
      </View>
    </NoahSafeAreaView>
  );
};

export default RestoreWalletScreen;
