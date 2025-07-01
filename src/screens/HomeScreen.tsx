import { View, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button } from "../components/ui/button";
import type { HomeStackParamList } from "../../App";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components/ui/text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { useCallback, useState } from "react";
import { COLORS } from "../lib/constants";
import { useBalance } from "../hooks/useWallet";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

const HomeScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data: balance, isFetching, refetch, error } = useBalance();
  const [isOpen, setIsOpen] = useState(false);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const totalBalance = balance ? balance.onchain + balance.offchain : 0;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const animatedRotation = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: withTiming(isOpen ? "180deg" : "0deg") }],
    };
  }, [isOpen]);

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
            <>
              <Collapsible open={isOpen} onOpenChange={setIsOpen} className="items-center">
                <CollapsibleTrigger asChild>
                  <Pressable>
                    <View className="flex-row items-center space-x-2">
                      <Text className="text-4xl font-bold">
                        {totalBalance.toLocaleString()} sats
                      </Text>
                      <Animated.View style={animatedRotation}>
                        <ChevronDown className="text-white" size={28} />
                      </Animated.View>
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
              <Button onPress={() => navigation.navigate("BoardArk")} className="mt-8">
                <Text>🚢 Board Ark</Text>
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HomeScreen;
