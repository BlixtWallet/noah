import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import SuccessAnimation from "./SuccessAnimation";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { copyToClipboard } from "../lib/clipboardUtils";

type ParsedResult = {
  amount_sat: number;
  destination: string;
  txid?: string;
  preimage?: string;
  success: boolean;
  type: string;
};

type SendSuccessProps = {
  parsedResult: ParsedResult;
  handleDone: () => void;
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
  const displayValue = value.length > 20 ? `${value.slice(0, 15)}...${value.slice(-10)}` : value;

  return (
    <View className="mt-2">
      <Text className="text-muted-foreground">{label}:</Text>
      <Pressable onPress={onCopy}>
        <Text className="text-foreground font-semibold">{copied ? "Copied!" : displayValue}</Text>
      </Pressable>
    </View>
  );
};

export const SendSuccess: React.FC<SendSuccessProps> = ({ parsedResult, handleDone }) => {
  return (
    <NoahSafeAreaView className="flex-1 bg-background justify-center items-center py-4">
      <SuccessAnimation className="mb-8" />
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">Amount:</Text>
            <Text className="text-foreground font-semibold">
              {parsedResult.amount_sat.toLocaleString()} sats
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">Type:</Text>
            <Text className="text-foreground font-semibold">{parsedResult.type}</Text>
          </View>
          <CopyableRow label="Destination" value={parsedResult.destination} />
          {parsedResult.txid && <CopyableRow label="Transaction ID" value={parsedResult.txid} />}
          {parsedResult.preimage && <CopyableRow label="Preimage" value={parsedResult.preimage} />}
        </CardContent>
      </Card>
      <NoahButton onPress={handleDone} className="w-full mt-8">
        Done
      </NoahButton>
    </NoahSafeAreaView>
  );
};
