import { View, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NoahButton } from "../components/ui/NoahButton";
import type { HomeStackParamList } from "../Navigators";
import { Text } from "../components/ui/text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { useCallback, useState } from "react";
import { COLORS } from "../lib/styleConstants";
import { useBalance, useSync } from "../hooks/useWallet";
import Icon from "@react-native-vector-icons/ionicons";
import { useQRCodeScanner } from "~/hooks/useQRCodeScanner";
import { QRCodeScanner } from "~/components/QRCodeScanner";

import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import { PLATFORM } from "~/constants";
import { useBtcToUsdRate } from "~/hooks/useMarketData";

const HomeScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data: balance, isFetching, refetch, error } = useBalance();
  const { mutateAsync: sync, isPending: isSyncing } = useSync();
  const { data: btcToUsdRate } = useBtcToUsdRate();
  const [isOpen, setIsOpen] = useState(false);
  const bottomTabBarHeight = useBottomTabBarHeight();

  const onRefresh = useCallback(async () => {
    await sync();
    await refetch();
  }, [sync, refetch]);

  const totalBalance = balance ? balance.onchain + balance.offchain : 0;
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
        <Text className="text-2xl font-bold text-foreground">Home</Text>
        <Pressable onPress={handleScanPress}>
          <Icon name="scan" size={28} color="white" />
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
                      <Text className="text-lg font-bold mb-2">Balance Details</Text>
                      <View className="flex-row justify-between">
                        <Text>Onchain:</Text>
                        <Text>{(balance?.onchain ?? 0).toLocaleString()} sats</Text>
                      </View>
                      <View className="flex-row justify-between mt-1">
                        <Text>Offchain:</Text>
                        <Text>{(balance?.offchain ?? 0).toLocaleString()} sats</Text>
                      </View>
                    </View>
                  </Animated.View>
                </CollapsibleContent>
              </Collapsible>
              <NoahButton onPress={() => navigation.navigate("BoardArk")} className="mt-8">
                🚢 Board Ark
              </NoahButton>
            </>
          )}
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default HomeScreen;
