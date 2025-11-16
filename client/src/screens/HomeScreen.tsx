import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NoahButton } from "../components/ui/NoahButton";
import type { HomeStackParamList } from "../Navigators";
import { Text } from "../components/ui/text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { COLORS } from "../lib/styleConstants";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";
import { useBalance, useLoadWallet, useWalletSync } from "../hooks/useWallet";
import Icon from "@react-native-vector-icons/ionicons";
import { useQRCodeScanner } from "~/hooks/useQRCodeScanner";
import { QRCodeScanner } from "~/components/QRCodeScanner";
import { APP_VARIANT } from "~/config";
import { BITCOIN_FACTS, PLATFORM } from "~/constants";
import { useAppVersionCheck } from "~/hooks/useAppVersionCheck";
import { UpdateWarningBanner } from "~/components/UpdateWarningBanner";
import { useBackgroundJobCoordination } from "~/hooks/useBackgroundJobCoordination";

import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import { useBtcToUsdRate } from "~/hooks/useMarketData";
import { useWalletStore } from "~/store/walletStore";
import { updateWidget } from "~/hooks/useWidget";
import { formatBip177 } from "~/lib/utils";
import { calculateBalances } from "~/lib/balanceUtils";
import { sync } from "~/lib/walletApi";

const HomeScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const isFocused = useIsFocused();
  const { walletError } = useWalletStore();
  const { safelyExecuteWhenReady, isBackgroundJobRunning } = useBackgroundJobCoordination();
  const { data: balance, refetch, error } = useBalance();
  const { isPending } = useWalletSync();
  const { mutateAsync: loadWallet } = useLoadWallet();
  const { data: btcToUsdRate } = useBtcToUsdRate();
  const [isOpen, setIsOpen] = useState(false);
  const [fact, setFact] = useState("");
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { isUpdateRequired, minimumVersion, currentVersion } = useAppVersionCheck();

  const getRandomFact = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * BITCOIN_FACTS.length);
    setFact(BITCOIN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    safelyExecuteWhenReady(() => loadWallet());
    getRandomFact();
  }, [getRandomFact, safelyExecuteWhenReady, loadWallet]);

  const onRefresh = useCallback(async () => {
    await safelyExecuteWhenReady(() => loadWallet());

    await sync();
    await refetch();
    await updateWidget();
    getRandomFact();
  }, [refetch, getRandomFact, safelyExecuteWhenReady, loadWallet]);

  const balances = balance ? calculateBalances(balance) : null;
  const totalBalance = balances?.totalBalance ?? 0;
  const onchainBalance = balances?.onchainBalance ?? 0;
  const offchainBalance = balances?.offchainBalance ?? 0;
  const totalPendingBalance = balances?.pendingBalance ?? 0;
  const totalBalanceInUsd = btcToUsdRate ? (totalBalance / 100_000_000) * btcToUsdRate : 0;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const animatedRotation = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: withTiming(isOpen ? "180deg" : "0deg") }],
    };
  }, [isOpen]);

  const { showCamera, setShowCamera, handleScanPress, codeScanner } = useQRCodeScanner({
    onScan: (value) => {
      navigation.navigate("Send", { destination: value });
    },
  });

  // Close scanner when navigating away from the screen
  useEffect(() => {
    if (!isFocused && showCamera) {
      setShowCamera(false);
    }
  }, [isFocused, showCamera, setShowCamera]);

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
        <Pressable onPress={() => navigation.navigate("BoardArk")}>
          <Icon name="boat" size={28} color="white" />
        </Pressable>
        <View className="flex-1 items-center">
          {APP_VARIANT !== "mainnet" && (
            <View className="rounded-md bg-yellow-400 px-2 py-1">
              <Text className="text-xs font-bold uppercase text-black">{APP_VARIANT}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => navigation.navigate("Transactions")}>
          <Icon name="list" size={28} color="white" />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isPending}
            onRefresh={onRefresh}
            tintColor={COLORS.BITCOIN_ORANGE}
            colors={[COLORS.BITCOIN_ORANGE]}
            title="Refreshing..."
            titleColor={COLORS.BITCOIN_ORANGE}
            progressViewOffset={-10}
          />
        }
      >
        {isUpdateRequired && (
          <UpdateWarningBanner
            currentVersion={currentVersion}
            minimumVersion={minimumVersion || "0.0.1"}
          />
        )}
        {isBackgroundJobRunning && (
          <View className="px-4 py-2 bg-blue-500/20 border-b border-blue-500/40">
            <View className="flex-row items-center justify-center space-x-2">
              <NoahActivityIndicator size="small" />
              <Text className="text-blue-400 text-sm">Background task in progress...</Text>
            </View>
          </View>
        )}
        <View className="items-center justify-center flex-1">
          {isPending && !balance ? (
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
                        <Text className="text-4xl font-bold">{formatBip177(totalBalance)}</Text>
                        <Animated.View style={animatedRotation}>
                          <ChevronDown color="white" size={28} />
                        </Animated.View>
                      </View>
                      {totalPendingBalance > 0 && (
                        <View className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40">
                          <Text className="text-yellow-500 text-sm">
                            Pending balance: {formatBip177(totalPendingBalance)}
                          </Text>
                        </View>
                      )}
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
                          <Text className="text-md font-bold">{formatBip177(onchainBalance)}</Text>
                        </View>
                        <View className="pl-4 space-y-1">
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Confirmed</Text>
                            <Text>{formatBip177(balance?.onchain.confirmed ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Trusted Pending</Text>
                            <Text>{formatBip177(balance?.onchain.trusted_pending ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Untrusted Pending</Text>
                            <Text>{formatBip177(balance?.onchain.untrusted_pending ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Immature</Text>
                            <Text>{formatBip177(balance?.onchain.immature ?? 0)}</Text>
                          </View>
                        </View>
                      </View>

                      <View>
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-md font-bold">Offchain</Text>
                          <Text className="text-md font-bold">{formatBip177(offchainBalance)}</Text>
                        </View>
                        <View className="pl-4 space-y-1">
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Spendable</Text>
                            <Text>{formatBip177(balance?.offchain.spendable ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Send</Text>
                            <Text>
                              {formatBip177(balance?.offchain.pending_lightning_send ?? 0)}
                            </Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Receive</Text>
                            <Text>
                              {formatBip177(
                                balance?.offchain.pending_lightning_receive.claimable ?? 0,
                              )}
                            </Text>
                          </View>

                          <View className="flex-row justify-between mb-2">
                            <Text className="text-muted-foreground">Pending In Round</Text>
                            <Text>{formatBip177(balance?.offchain.pending_in_round ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Exit</Text>
                            <Text>{formatBip177(balance?.offchain.pending_exit ?? 0)}</Text>
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="text-muted-foreground">Pending Board</Text>
                            <Text>{formatBip177(balance?.offchain.pending_board ?? 0)}</Text>
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
