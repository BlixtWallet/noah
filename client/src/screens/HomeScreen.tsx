import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { COLORS } from "../lib/styleConstants";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";
import { useBalance, useBalanceSync, useLoadWallet } from "../hooks/useWallet";
import Icon from "@react-native-vector-icons/ionicons";
import { useQRCodeScanner } from "~/hooks/useQRCodeScanner";
import { QRCodeScanner } from "~/components/QRCodeScanner";
import { APP_VARIANT } from "~/config";
import { BITCOIN_FACTS, PLATFORM } from "~/constants";

import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBtcToUsdRate } from "~/hooks/useMarketData";
import { useWalletStore } from "~/store/walletStore";

const HomeScreen = () => {
  const router = useRouter();
  const { walletError } = useWalletStore();
  const { data: balance, isFetching, refetch, error } = useBalance();
  const { mutateAsync: balanceSync, isPending: isSyncing } = useBalanceSync();
  const { mutateAsync: loadWallet } = useLoadWallet();
  const { data: btcToUsdRate } = useBtcToUsdRate();
  const [isOpen, setIsOpen] = useState(false);
  const [fact, setFact] = useState("");
  const insets = useSafeAreaInsets();

  // Use safe area bottom or default tab bar height
  const bottomTabBarHeight = insets.bottom > 0 ? insets.bottom + 50 : 80;

  const getRandomFact = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * BITCOIN_FACTS.length);
    setFact(BITCOIN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    loadWallet();
    getRandomFact();
  }, [getRandomFact, loadWallet]);

  const onRefresh = useCallback(async () => {
    await loadWallet();

    await balanceSync();
    await refetch();
    getRandomFact();
  }, [balanceSync, refetch, getRandomFact, loadWallet]);

  const onchainBalance = balance
    ? balance.onchain.confirmed +
      balance.onchain.immature +
      balance.onchain.trusted_pending +
      balance.onchain.untrusted_pending
    : 0;
  const offchainBalance = balance
    ? balance.offchain.pending_exit +
      balance.offchain.pending_lightning_send +
      balance.offchain.pending_in_round +
      balance.offchain.spendable
    : 0;
  const totalBalance = onchainBalance + offchainBalance;
  const totalBalanceInUsd = btcToUsdRate ? (totalBalance / 100_000_000) * btcToUsdRate : 0;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const animatedRotation = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: withTiming(isOpen ? "180deg" : "0deg") }],
    };
  }, [isOpen]);

  const { showCamera, setShowCamera, handleScanPress, codeScanner } = useQRCodeScanner({
    onScan: (value) => {
      router.push(`/(tabs)/(home)/send-to?destination=${encodeURIComponent(value)}`);
    },
  });

  if (showCamera) {
    return <QRCodeScanner codeScanner={codeScanner} onClose={() => setShowCamera(false)} />;
  }

  return (
    <NoahSafeAreaView
      className="flex-1 bg-background"
      style={{
        paddingBottom: PLATFORM === "ios" ? bottomTabBarHeight : 0,
      }}
    >
      <View className="flex-row items-center justify-between p-4">
        <Pressable onPress={() => router.push("/(tabs)/(home)/board-ark")}>
          <Icon name="boat" size={28} color="white" />
        </Pressable>
        <View className="flex-1 items-center">
          {APP_VARIANT !== "mainnet" && (
            <View className="rounded-md bg-yellow-400 px-2 py-1">
              <Text className="text-xs font-bold uppercase text-black">{APP_VARIANT}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => router.push("/(tabs)/(home)/transactions")}>
          <Icon name="list" size={28} color="white" />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching || isSyncing}
            onRefresh={onRefresh}
            tintColor={COLORS.BITCOIN_ORANGE}
            colors={[COLORS.BITCOIN_ORANGE]}
            title="Refreshing..."
            titleColor={COLORS.BITCOIN_ORANGE}
            progressViewOffset={-10}
          />
        }
      >
        <View className="items-center justify-center flex-1">
          {isFetching && !balance ? (
            <NoahActivityIndicator size="large" />
          ) : error || walletError ? (
            <Alert variant="destructive" icon={AlertCircle}>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {walletError
                  ? "Failed to connect to wallet. Pull down to try again."
                  : errorMessage}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Collapsible open={isOpen} onOpenChange={setIsOpen} className="items-center">
                <CollapsibleTrigger asChild>
                  <Pressable>
                    <View className="items-center">
                      {btcToUsdRate ? (
                        <Text className="text-2xl text-muted-foreground mb-2">
                          $
                          {totalBalanceInUsd.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </Text>
                      ) : (
                        <View className="h-[32px] mb-2 justify-center">
                          <NoahActivityIndicator />
                        </View>
                      )}
                      <View className="flex-row items-center space-x-2">
                        <Text className="text-4xl font-bold">
                          {totalBalance.toLocaleString()} sats
                        </Text>
                        <Animated.View style={animatedRotation}>
                          <ChevronDown color="white" size={28} />
                        </Animated.View>
                      </View>
                    </View>
                  </Pressable>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Animated.View entering={FadeInDown} exiting={FadeOutDown}>
                    <View className="p-4 rounded-lg bg-card mt-4 min-w-[300px]">
                      <Text className="text-lg font-bold mb-4 text-center">Balance Details</Text>

                      <View className="mb-4">
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-md font-bold">Onchain</Text>
                          <Text className="text-md font-bold">
                            {onchainBalance.toLocaleString()} sats
                          </Text>
                        </View>
                        <View className="pl-4 space-y-1">
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Confirmed</Text>
                            <Text>{(balance?.onchain.confirmed ?? 0).toLocaleString()} sats</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Trusted Pending</Text>
                            <Text>
                              {(balance?.onchain.trusted_pending ?? 0).toLocaleString()} sats
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Untrusted Pending</Text>
                            <Text>
                              {(balance?.onchain.untrusted_pending ?? 0).toLocaleString()} sats
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Immature</Text>
                            <Text>{(balance?.onchain.immature ?? 0).toLocaleString()} sats</Text>
                          </View>
                        </View>
                      </View>

                      <View>
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-md font-bold">Offchain</Text>
                          <Text className="text-md font-bold">
                            {offchainBalance.toLocaleString()} sats
                          </Text>
                        </View>
                        <View className="pl-4 space-y-1">
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Spendable</Text>
                            <Text>{(balance?.offchain.spendable ?? 0).toLocaleString()} sats</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Send</Text>
                            <Text>
                              {(balance?.offchain.pending_lightning_send ?? 0).toLocaleString()}{" "}
                              sats
                            </Text>
                          </View>
                          <View className="flex-row justify-between mb-2">
                            <Text className="text-muted-foreground">Pending In Round</Text>
                            <Text>
                              {(balance?.offchain.pending_in_round ?? 0).toLocaleString()} sats
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Exit</Text>
                            <Text>
                              {(balance?.offchain.pending_exit ?? 0).toLocaleString()} sats
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                </CollapsibleContent>
              </Collapsible>
              <NoahButton onPress={handleScanPress} className="mt-8">
                📷 Scan QR Code
              </NoahButton>
            </>
          )}
        </View>
        <View className="p-4 items-center justify-center mb-16">
          <Text className="text-muted-foreground text-center text-xs">{fact}</Text>
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default HomeScreen;
