import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import SuccessAnimation from "./SuccessAnimation";
import { copyToClipboard } from "../lib/clipboardUtils";
import { formatNumber, satsToUsd, formatBip177 } from "~/lib/utils";

type ParsedResult = {
  amount_sat: number;
  destination: string;
  txid?: string;
  preimage?: string;
  success: boolean;
  type: string;
};

type SendSuccessBottomSheetProps = {
  parsedResult: ParsedResult;
  handleDone: () => void;
  btcPrice?: number;
};

const CopyableRow = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await copyToClipboard(value, {
      onCopy: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      },
    });
  };

  // Trim the displayed value to make it more readable
  const displayValue = value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-10)}` : value;

  return (
    <View className="flex-row justify-between items-start py-3">
      <Text className="text-muted-foreground text-base py-1">{label}</Text>
      <Pressable onPress={onCopy} className="flex-1 ml-4">
        <Text className="text-foreground font-semibold text-right text-base py-1">
          {copied ? "Copied!" : displayValue}
        </Text>
      </Pressable>
    </View>
  );
};

export const SendSuccessBottomSheet: React.FC<SendSuccessBottomSheetProps> = ({
  parsedResult,
  handleDone,
  btcPrice,
}) => {
  const usdAmount = btcPrice ? satsToUsd(parsedResult.amount_sat, btcPrice) : 0;

  return (
    <View className="space-y-10">
      <View className="items-center space-y-8">
        <SuccessAnimation />
        <View className="items-center space-y-4 py-2">
          <Text className="text-2xl font-bold text-foreground py-2">Payment Sent!</Text>
          <Text className="text-muted-foreground text-center text-base py-1">
            Your transaction has been successfully processed
          </Text>
        </View>
      </View>

      <View className="bg-muted/30 rounded-xl p-6 space-y-8">
        <View className="items-center space-y-3 py-2">
          <Text className="text-4xl font-bold text-foreground py-2">
            {formatBip177(parsedResult.amount_sat)}
          </Text>
          {btcPrice && (
            <Text className="text-xl text-muted-foreground py-1">${formatNumber(usdAmount)}</Text>
          )}
        </View>

        <View className="border-t border-border pt-8 space-y-6">
          <View className="flex-row justify-between items-center py-3">
            <Text className="text-muted-foreground text-base py-1">Payment Method</Text>
            <Text className="text-foreground font-semibold text-base py-1">
              {parsedResult.type}
            </Text>
          </View>

          <CopyableRow label="Destination" value={parsedResult.destination} />

          {parsedResult.txid && <CopyableRow label="Transaction ID" value={parsedResult.txid} />}

          {parsedResult.preimage && <CopyableRow label="Preimage" value={parsedResult.preimage} />}
        </View>
      </View>

      <View className="pt-8">
        <NoahButton onPress={handleDone} className="w-full py-4">
          Done
        </NoahButton>
      </View>
    </View>
  );
};
