import {
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
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
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  useCameraPermission,
} from "react-native-vision-camera";
import { isValidDestination } from "../lib/sendUtils";
import { useAlert } from "~/contexts/AlertProvider";
import { SafeAreaView } from "react-native-safe-area-context";

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
import { Button } from "~/components/ui/button";

const HomeScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data: balance, isFetching, refetch, error } = useBalance();
  const { mutateAsync: sync, isPending: isSyncing } = useSync();
  const { data: btcToUsdRate } = useBtcToUsdRate();
  const [isOpen, setIsOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { showAlert } = useAlert();

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

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const isFocused = useIsFocused();

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "ean-13"],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) {
        const scannedValue = codes[0].value;
        if (isValidDestination(scannedValue)) {
          navigation.navigate("Send", { destination: scannedValue });
          setShowCamera(false);
        } else {
          setShowCamera(false);
          showAlert({
            title: "Invalid QR Code",
            description:
              "The scanned QR code does not contain a valid Bitcoin address, BOLT11 invoice, Lightning Address, or Ark public key.",
          });
        }
      }
    },
  });

  const handleScanPress = async () => {
    if (!hasPermission) {
      const permissionGranted = await requestPermission();
      if (!permissionGranted) {
        showAlert({
          title: "Permission required",
          description: "Camera permission is required to scan QR codes.",
        });
        return;
      }
    }
    setShowCamera(true);
  };

  if (showCamera) {
    if (!device) {
      return (
        <NoahSafeAreaView className="flex-1 bg-background justify-center items-center p-4">
          <Text className="text-lg text-center">No camera device found.</Text>
          <Button onPress={() => setShowCamera(false)} className="mt-4">
            <Text>Back</Text>
          </Button>
        </NoahSafeAreaView>
      );
    }
    return (
      <View style={StyleSheet.absoluteFill}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused && showCamera}
          codeScanner={codeScanner}
        />
        <SafeAreaView>
          <Pressable onPress={() => setShowCamera(false)} className="m-4 self-start">
            <Icon name="close-circle" size={32} color="white" />
          </Pressable>
        </SafeAreaView>
      </View>
    );
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
