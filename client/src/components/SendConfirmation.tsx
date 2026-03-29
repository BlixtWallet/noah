import React from "react";
import { View } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import { Button } from "./ui/button";
import { formatNumber, satsToUsd, formatBip177 } from "~/lib/utils";
import { DestinationTypes, ParsedBip321 } from "~/lib/sendUtils";
import { useThemeColors } from "~/hooks/useTheme";
import { COLORS } from "~/lib/styleConstants";
import { Bip321Picker } from "./Bip321Picker";

interface SendConfirmationProps {
  destination: string;
  amount: number;
  destinationType: DestinationTypes;
  comment?: string;
  btcPrice?: number;
  bip321Data?: ParsedBip321 | null;
  selectedPaymentMethod?: "ark" | "lightning" | "onchain" | "offer";
  onSelectPaymentMethod?: (type: "ark" | "lightning" | "onchain" | "offer") => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const truncateValue = (value: string) => {
  if (value.length <= 32) {
    return value;
  }

  return `${value.slice(0, 14)}...${value.slice(-10)}`;
};

export const SendConfirmation: React.FC<SendConfirmationProps> = ({
  destination,
  amount,
  destinationType,
  comment,
  btcPrice,
  bip321Data,
  selectedPaymentMethod,
  onSelectPaymentMethod,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const colors = useThemeColors();

  const getPaymentMethodLabel = () => {
    if (destinationType === "bip321") {
      switch (selectedPaymentMethod) {
        case "ark":
          return "Ark";
        case "lightning":
          return "Lightning";
        case "offer":
          return "Offer";
        case "onchain":
        default:
          return "On-chain";
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
        return "On-chain";
      case "offer":
        return "Offer";
      default:
        return "Bitcoin";
    }
  };

  const getDestinationDisplay = () => {
    if (destinationType === "bip321" && bip321Data) {
      if (selectedPaymentMethod === "ark" && bip321Data.arkAddress) {
        return bip321Data.arkAddress;
      }

      if (selectedPaymentMethod === "lightning" && bip321Data.lightningInvoice) {
        return bip321Data.lightningInvoice;
      }

      if (selectedPaymentMethod === "offer" && bip321Data.offer) {
        return bip321Data.offer;
      }

      if (selectedPaymentMethod === "onchain" && bip321Data.onchainAddress) {
        return bip321Data.onchainAddress;
      }
    }

    return destination;
  };

  const usdAmount = btcPrice ? satsToUsd(amount, btcPrice) : 0;
  const resolvedDestination = getDestinationDisplay();

  return (
    <View>
      <View className="items-center">
        <Text className="text-center text-3xl font-bold text-foreground">Confirm send</Text>
        <Text className="mt-3 max-w-[280px] text-center text-base leading-6 text-muted-foreground">
          Review the route and destination before broadcasting the payment.
        </Text>
      </View>

      <View className="mt-8 items-center">
        <Text className="text-center text-4xl font-bold text-foreground">
          {formatBip177(amount)}
        </Text>
        {btcPrice ? (
          <Text className="mt-3 text-lg font-medium text-muted-foreground">
            ≈ ${formatNumber(usdAmount)}
          </Text>
        ) : null}
      </View>

      <View
        className="mt-8 rounded-[24px] border px-5 py-5"
        style={{
          borderColor: `${colors.mutedForeground}22`,
          backgroundColor: `${colors.card}CC`,
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium uppercase tracking-[2px] text-muted-foreground">
            Payment route
          </Text>
          {destinationType !== "bip321" ? (
            <Text className="text-sm font-semibold" style={{ color: COLORS.BITCOIN_ORANGE }}>
              {getPaymentMethodLabel()}
            </Text>
          ) : null}
        </View>

        {destinationType === "bip321" && bip321Data && selectedPaymentMethod && onSelectPaymentMethod ? (
          <Bip321Picker
            bip321Data={bip321Data}
            selectedPaymentMethod={selectedPaymentMethod}
            onSelect={onSelectPaymentMethod}
            showSectionHeader={false}
            showSelectedDestination={true}
          />
        ) : (
          <View className="mt-4 h-px bg-border" />
        )}

        {destinationType !== "bip321" ? (
          <View className="py-4">
            <Text className="text-sm font-medium uppercase tracking-[2px] text-muted-foreground">
              Destination
            </Text>
            <Text className="mt-2 text-sm leading-6 text-foreground">
              {truncateValue(resolvedDestination)}
            </Text>
          </View>
        ) : null}

        {comment ? (
          <>
            <View className="h-px bg-border" />
            <View className="py-4">
              <Text className="text-sm font-medium uppercase tracking-[2px] text-muted-foreground">
                Note
              </Text>
              <Text className="mt-2 text-sm leading-6 text-foreground">{comment}</Text>
            </View>
          </>
        ) : null}
      </View>

      <View className="mt-8 flex-row gap-3">
        <Button
          onPress={onCancel}
          variant="outline"
          disabled={isLoading}
          className="flex-1 rounded-2xl py-4"
        >
          <Text className="font-semibold">Cancel</Text>
        </Button>
        <NoahButton
          onPress={onConfirm}
          isLoading={isLoading}
          disabled={isLoading}
          className="flex-1 rounded-2xl py-4"
        >
          Confirm & Send
        </NoahButton>
      </View>
    </View>
  );
};
