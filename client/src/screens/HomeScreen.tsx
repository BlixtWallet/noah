import { View, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NoahButton } from "../components/ui/NoahButton";
import type { HomeStackParamList } from "../Navigators";
import { Text } from "../components/ui/text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { COLORS } from "../lib/styleConstants";
import { useBalance, useBalanceSync } from "../hooks/useWallet";
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
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import { useBtcToUsdRate } from "~/hooks/useMarketData";

const HomeScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data: balance, isFetching, refetch, error } = useBalance();
  const { mutateAsync: balanceSync, isPending: isSyncing } = useBalanceSync();
  const { data: btcToUsdRate } = useBtcToUsdRate();
  const [isOpen, setIsOpen] = useState(false);
  const [fact, setFact] = useState("");
  const bottomTabBarHeight = useBottomTabBarHeight();

  const getRandomFact = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * BITCOIN_FACTS.length);
    setFact(BITCOIN_FACTS[randomIndex]);
  }, []);

  useEffect(() => {
    getRandomFact();
  }, [getRandomFact]);

  const onRefresh = useCallback(async () => {
    await balanceSync();
    await refetch();
    getRandomFact();
  }, [balanceSync, refetch, getRandomFact]);

  const onchainBalance = balance
    ? balance.onchain.confirmed +
      balance.onchain.immature +
      balance.onchain.trusted_pending +
      balance.onchain.untrusted_pending
    : 0;
  const offchainBalance = balance
    ? balance.offchain.pending_exit +
      balance.offchain.pending_lightning_send +
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
      navigation.navigate("Send", { destination: value });
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
        <Pressable onPress={handleScanPress}>
          <Icon name="scan" size={28} color="white" />
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
          !balance ? undefined : (
            <RefreshControl
              refreshing={isFetching || isSyncing}
              onRefresh={onRefresh}
              tintColor={COLORS.BITCOIN_ORANGE}
              colors={[COLORS.BITCOIN_ORANGE]}
              title="Refreshing..."
              titleColor={COLORS.BITCOIN_ORANGE}
              progressViewOffset={-10}
            />
          )
        }
      >
        <View className="items-center justify-center flex-1">
          {isFetching && !balance ? (
            <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          ) : error ? (
            <Alert variant="destructive" icon={AlertCircle}>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
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
                          <ActivityIndicator color={COLORS.BITCOIN_ORANGE} />
                        </View>
                      )}
                      <View className="flex-row items-center space-x-2">
                        <Text className="text-4xl font-bold">
                          {totalBalance.toLocaleString()} sats
                        </Text>
                        <Animated.View style={animatedRotation}>
                          <ChevronDown className="text-white" size={28} />
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
              <NoahButton onPress={() => navigation.navigate("BoardArk")} className="mt-8">
                🚢 Board/Offboard Ark
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
