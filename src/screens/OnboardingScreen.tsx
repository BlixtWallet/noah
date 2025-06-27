import React from "react";
import { View, Text, ActivityIndicator, Alert, Pressable } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { createMnemonic, createWallet } from "react-native-nitro-ark";
import { useWalletStore } from "../store/walletStore";
import { ACTIVE_WALLET_CONFIG, ARK_DATA_PATH } from "../constants";

const OnboardingScreen = () => {
  const setMnemonic = useWalletStore((state) => state.setMnemonic);

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      try {
        const mnemonic = await createMnemonic();

        console.log("Active wallet config", ACTIVE_WALLET_CONFIG);
        await createWallet(ARK_DATA_PATH, {
          ...ACTIVE_WALLET_CONFIG,
          mnemonic,
        });
        console.log("Wallet created successfully!");
        return mnemonic;
      } catch (error) {
        console.error("Wallet creation failed:", error);
        throw new Error(
          `Failed to create wallet: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    onSuccess: (mnemonic) => {
      setMnemonic(mnemonic);
    },
    onError: (error: Error) => {
      Alert.alert("Creation Failed", error.message);
    },
  });

  return (
    <View className="flex-1 items-center justify-center bg-white p-5">
      <Text className="text-3xl font-bold mb-4 text-center">
        Welcome to Noah
      </Text>
      <Text className="text-lg text-gray-600 mb-10 text-center">
        Tap the button below to create your secure Bitcoin wallet.
      </Text>
      {createWalletMutation.status === "pending" ? (
        <View className="items-center">
          <ActivityIndicator size="large" color="#0000ff" />
          <Text className="mt-4 text-gray-500">Creating your wallet...</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => createWalletMutation.mutate()}
          className="bg-blue-500 rounded-lg px-8 py-4 active:bg-blue-600"
        >
          <Text className="text-white font-bold text-xl">Create Wallet</Text>
        </Pressable>
      )}
    </View>
  );
};

export default OnboardingScreen;
