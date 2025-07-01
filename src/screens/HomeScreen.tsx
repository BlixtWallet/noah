import { View, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { getBalance } from "react-native-nitro-ark";
import { useWalletStore } from "../store/walletStore";
import { ARK_DATA_PATH } from "../constants";
import { Text } from "../components/ui/text";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle } from "lucide-react-native";
import { useCallback } from "react";
import { COLORS } from "../lib/constants";

const HomeScreen = () => {
  const mnemonic = useWalletStore((state) => state.mnemonic);

  const fetchBalance = async (sync: boolean) => {
    if (!mnemonic) return null;
    const newBalance = await getBalance(ARK_DATA_PATH, mnemonic, sync);
    return newBalance;
  };

  const {
    data: balance,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ["balance"],
    queryFn: () => fetchBalance(true),
    enabled: !!mnemonic,
    retry: false,
  });

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const totalBalance = balance ? balance.onchain + balance.offchain : 0;
  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={onRefresh}
            tintColor={COLORS.BITCOIN_ORANGE}
            colors={[COLORS.BITCOIN_ORANGE]}
            title="Refreshing..."
            titleColor={COLORS.BITCOIN_ORANGE}
          />
        }
      >
        <View className="items-center justify-center flex-1 px-4">
          {isFetching && !balance ? (
            <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          ) : error ? (
            <Alert variant="destructive" icon={AlertCircle}>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Pressable>
                  <Text className="text-4xl font-bold">{totalBalance.toLocaleString()} sats</Text>
                </Pressable>
              </PopoverTrigger>
              <PopoverContent>
                <View className="p-4">
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
              </PopoverContent>
            </Popover>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HomeScreen;
