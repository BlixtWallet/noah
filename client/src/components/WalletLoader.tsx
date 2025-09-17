import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { useWalletStore } from "../store/walletStore";
import { useLoadWallet, useCloseWallet } from "../hooks/useWallet";
import { isWalletLoaded as isWalletLoadedNitro } from "react-native-nitro-ark";
import { getMnemonic } from "../lib/crypto";
import { NoahActivityIndicator } from "./ui/NoahActivityIndicator";

interface WalletLoaderProps {
  children: React.ReactNode;
}

/**
 * WalletLoader gates the rest of the application behind wallet-initialisation.
 * It handles loading / unloading the wallet and shows a fallback spinner until
 * the wallet is ready.  By mounting the rest of the app only _after_ the
 * wallet is loaded we avoid unnecessary renders for components such as
 * `AppServices`.
 */
const WalletLoader: React.FC<WalletLoaderProps> = ({ children }) => {
  const { isInitialized, isWalletLoaded, walletError } = useWalletStore();
  const { mutate: loadWallet, isPending: isWalletLoading } = useLoadWallet();
  const { mutate: closeWallet } = useCloseWallet();

  // kick-off the wallet load once onboarding is finished
  useEffect(() => {
    const checkAndLoadWallet = async () => {
      if (!isInitialized) return;

      const actuallyLoaded = await isWalletLoadedNitro();

      // If the persisted state says loaded but wallet isn't actually loaded, fix the state
      if (isWalletLoaded && !actuallyLoaded) {
        useWalletStore.getState().setWalletUnloaded();
        return;
      }

      // If wallet isn't loaded, load it
      if (!actuallyLoaded) {
        loadWallet();
      }
    };

    checkAndLoadWallet();
  }, [isInitialized, isWalletLoaded, loadWallet]);

  // Additional effect to handle app initialization and wallet existence check
  useEffect(() => {
    const checkWalletExistence = async () => {
      const mnemonicResult = await getMnemonic();

      // If we have a mnemonic but isInitialized is false, fix the state
      if (mnemonicResult.isOk() && mnemonicResult.value && !isInitialized) {
        useWalletStore.getState().finishOnboarding();
      }
    };

    // Only run this check if not initialized
    if (!isInitialized) {
      checkWalletExistence();
    }
  }, [isInitialized]);

  // tidy up by closing the wallet when the component unmounts
  useEffect(() => {
    return () => {
      // Check if wallet is actually loaded before trying to close
      const cleanup = async () => {
        try {
          const actuallyLoaded = await isWalletLoadedNitro();
          if (actuallyLoaded) {
            closeWallet();
          }
        } catch (error) {
          // If we can't check, don't try to close to avoid errors
          console.log("Skipping wallet close due to check error:", error);
        }
      };

      cleanup();
    };
  }, [closeWallet]);

  if ((isWalletLoading || !isWalletLoaded) && !walletError) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <NoahActivityIndicator size="large" />
        <Text style={{ marginTop: 10, color: "white" }}>Loading Wallet...</Text>
      </View>
    );
  }

  return <>{children}</>;
};

export default WalletLoader;
