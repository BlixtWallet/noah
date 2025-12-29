import React from "react";
import { View } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import { Button } from "./ui/button";
import { formatNumber, satsToUsd, formatBip177 } from "~/lib/utils";
import { DestinationTypes, ParsedBip321 } from "~/lib/sendUtils";

interface SendConfirmationProps {
  destination: string;
  amount: number; // in sats
  destinationType: DestinationTypes;
  comment?: string;
  btcPrice?: number;
  bip321Data?: ParsedBip321 | null;
  selectedPaymentMethod?: "ark" | "lightning" | "onchain" | "offer";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const SendConfirmation: React.FC<SendConfirmationProps> = ({
  destination,
  amount,
  destinationType,
  comment,
  btcPrice,
  bip321Data,
  selectedPaymentMethod,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const getPaymentMethodLabel = () => {
    if (destinationType === "bip321") {
      switch (selectedPaymentMethod) {
        case "ark":
          return "Ark";
        case "lightning":
          return "Lightning";
        case "onchain":
          return "Bitcoin";
        default:
          return "Bitcoin";
      }
    }

    switch (destinationType) {
      case "ark":
        return "Ark";
      case "lightning":
        return "Lightning";
      case "lnurl":
        return "Lightning Address";
      case "onchain":
        return "Bitcoin";
      default:
        return "Unknown";
    }
  };

  const getDestinationDisplay = () => {
    if (destinationType === "bip321" && bip321Data) {
      if (selectedPaymentMethod === "ark" && bip321Data.arkAddress) {
        return bip321Data.arkAddress;
      } else if (selectedPaymentMethod === "lightning" && bip321Data.lightningInvoice) {
        return bip321Data.lightningInvoice;
      } else if (selectedPaymentMethod === "onchain" && bip321Data.onchainAddress) {
        return bip321Data.onchainAddress;
      }
    }

    return destination;
  };

  const formatDestination = (dest: string) => {
    if (dest.length > 20) {
      return `${dest.slice(0, 10)}...${dest.slice(-10)}`;
    }
    return dest;
  };

  const usdAmount = btcPrice ? satsToUsd(amount, btcPrice) : 0;

  return (
    <View className="space-y-10">
      <View className="items-center space-y-4 py-2">
        <Text className="text-2xl font-bold text-foreground py-2">Confirm Payment</Text>
        <Text className="text-muted-foreground text-center text-base py-1">
          Review the details before sending
        </Text>
      </View>

      <View className="bg-muted/30 rounded-xl p-6 space-y-8">
        <View className="items-center space-y-3 py-2">
          <Text className="text-4xl font-bold text-foreground py-2">{formatBip177(amount)}</Text>
          {btcPrice && (
            <Text className="text-xl text-muted-foreground py-1">${formatNumber(usdAmount)}</Text>
          )}
        </View>

        <View className="border-t border-border pt-8 space-y-6">
          <View className="flex-row justify-between items-center py-3">
            <Text className="text-muted-foreground text-base py-1">Payment Method</Text>
            <Text className="text-foreground font-semibold text-base py-1">
              {getPaymentMethodLabel()}
            </Text>
          </View>

          <View className="flex-row justify-between items-start py-3">
            <Text className="text-muted-foreground text-base py-1">To</Text>
            <Text className="text-foreground font-semibold text-right flex-1 ml-4 text-base py-1">
              {formatDestination(getDestinationDisplay())}
            </Text>
          </View>

          {comment && (
            <View className="flex-row justify-between items-start py-3">
              <Text className="text-muted-foreground text-base py-1">Note</Text>
              <Text className="text-foreground font-semibold text-right flex-1 ml-4 text-base py-1">
                {comment}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="flex-row gap-4 pt-8">
        <View className="flex-1">
          <Button onPress={onCancel} variant="outline" disabled={isLoading} className="w-full py-3">
            <Text>Cancel</Text>
          </Button>
        </View>
        <View className="flex-1">
          <NoahButton
            onPress={onConfirm}
            isLoading={isLoading}
            disabled={isLoading}
            className="w-full py-4"
          >
            Confirm & Send
          </NoahButton>
        </View>
      </View>
    </View>
  );
};
