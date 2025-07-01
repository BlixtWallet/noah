import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getBalance } from "react-native-nitro-ark";
import { useWalletStore } from "../store/walletStore";
import { ARK_DATA_PATH } from "../constants";
import { Text } from "../components/ui/text";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle } from "lucide-react-native";
import { useState, useCallback } from "react";

const HomeScreen = () => {
  const mnemonic = useWalletStore((state) => state.mnemonic);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBalance = async (sync: boolean) => {
    if (!mnemonic) return null;
    try {
      setError(null);
      const newBalance = await getBalance(ARK_DATA_PATH, mnemonic, sync);
      return newBalance;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      console.error("Failed to get balance:", e);
      throw e;
    }
  };

  const {
    data: balance,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["balance"],
    queryFn: () => fetchBalance(true),
    enabled: !!mnemonic,
    retry: false,
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const totalBalance = balance ? balance.onchain + balance.offchain : 0;

  return (
    <ScrollView
      className="bg-background"
      contentContainerStyle={{
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#c98a3c" />
      }
    >
      <View className="items-center pt-20 px-4">
        {isLoading && !isRefreshing ? (
          <Text className="text-4xl font-bold">Loading...</Text>
        ) : error ? (
          <Alert variant="destructive" icon={AlertCircle}>
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
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
  );
};

export default HomeScreen;
