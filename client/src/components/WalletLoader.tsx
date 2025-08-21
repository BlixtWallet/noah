import React, { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useWalletStore } from "../store/walletStore";
import { useLoadWallet, useCloseWallet } from "../hooks/useWallet";
import { COLORS } from "../lib/styleConstants";

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
    if (isInitialized && !isWalletLoaded) {
      loadWallet();
    }
  }, [isInitialized, isWalletLoaded, loadWallet]);

  // tidy up by closing the wallet when the component unmounts
  useEffect(() => {
    return () => {
      if (isWalletLoaded) {
        closeWallet();
      }
    };
  }, [isWalletLoaded, closeWallet]);

  if ((isWalletLoading || !isWalletLoaded) && !walletError) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
        <Text style={{ marginTop: 10, color: "white" }}>Loading Wallet...</Text>
      </View>
    );
  }

  return <>{children}</>;
};

export default WalletLoader;
