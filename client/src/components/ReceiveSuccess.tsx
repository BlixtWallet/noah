import React, { useEffect } from "react";
import { View } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import ReceiveAnimation from "./ReceiveAnimation";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { formatNumber, satsToUsd } from "~/lib/utils";
import * as Haptics from "expo-haptics";

type ReceiveSuccessProps = {
  amountSat: number;
  btcPrice?: number;
  handleDone: () => void;
};

export const ReceiveSuccess: React.FC<ReceiveSuccessProps> = ({
  amountSat,
  btcPrice,
  handleDone,
}) => {
  const usdAmount = btcPrice ? satsToUsd(amountSat, btcPrice) : 0;

  useEffect(() => {
    const triggerHaptic = async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    triggerHaptic();
  }, []);

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center items-center px-6">
        <View className="items-center w-full">
          <ReceiveAnimation />

          <View className="items-center mt-8 mb-6">
            <Text className="text-green-500 text-xl font-bold mb-3">Success!</Text>
            <Text className="text-2xl font-bold text-foreground mb-4">Payment Received!</Text>
            <Text className="text-muted-foreground text-center text-base">
              Lightning payment received successfully
            </Text>
          </View>

          <View className="bg-card rounded-2xl p-8 w-full items-center mt-6">
            <View className="flex-row items-baseline mb-4">
              <Text className="text-5xl font-bold text-foreground mr-2">
                {formatNumber(amountSat)}
              </Text>
              <Text className="text-2xl text-foreground font-semibold">sats</Text>
            </View>
            {btcPrice && (
              <Text className="text-lg text-muted-foreground">≈ ${formatNumber(usdAmount)}</Text>
            )}
          </View>

          <View className="w-full mt-8 px-4">
            <NoahButton onPress={handleDone} className="py-4">
              Done
            </NoahButton>
          </View>
        </View>
      </View>
    </NoahSafeAreaView>
  );
};
