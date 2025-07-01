import React from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { createMnemonic, createWallet } from "react-native-nitro-ark";
import { useWalletStore } from "../store/walletStore";
import { ARK_DATA_PATH } from "../constants";
import { APP_VARIANT } from "../config";
import { Button } from "../components/ui/button";
import { Text } from "../components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/constants";

const OnboardingScreen = () => {
  const { setMnemonic, config } = useWalletStore();

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      try {
        const mnemonic = await createMnemonic();

        const creationConfig =
          APP_VARIANT === "regtest"
            ? {
                force: false,
                regtest: true,
                signet: false,
                bitcoin: false,
                config: {
                  bitcoind: config.bitcoind,
                  asp: config.asp,
                  bitcoind_user: config.bitcoind_user,
                  bitcoind_pass: config.bitcoind_pass,
                  vtxo_refresh_expiry_threshold: 288,
                },
              }
            : {
                force: false,
                regtest: false,
                signet: APP_VARIANT === "signet",
                bitcoin: APP_VARIANT === "mainnet",
                config: {
                  esplora: config.esplora,
                  asp: config.asp,
                  vtxo_refresh_expiry_threshold: 288,
                },
              };

        console.log("Active wallet config", creationConfig);
        await createWallet(ARK_DATA_PATH, {
          ...creationConfig,
          mnemonic,
        });
        console.log("Wallet created successfully!");
        return mnemonic;
      } catch (error) {
        console.error("Wallet creation failed:", error);
        throw new Error(
          `Failed to create wallet: ${error instanceof Error ? error.message : String(error)}`,
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
    <SafeAreaView className="flex-1 items-center justify-center bg-background p-5">
      <Text className="text-3xl font-bold mb-4 text-center">Welcome to Noah</Text>
      <Text className="text-lg text-muted-foreground mb-10 text-center">
        Tap the button below to create your secure Bitcoin wallet.
      </Text>
      {createWalletMutation.status === "pending" ? (
        <View className="items-center">
          <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          <Text className="mt-4 text-muted-foreground">Creating your wallet...</Text>
        </View>
      ) : (
        <Button
          onPress={() => createWalletMutation.mutate()}
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
