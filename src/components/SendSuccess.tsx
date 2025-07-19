import React from "react";
import { View } from "react-native";
import { Text } from "../components/ui/text";
import { NoahButton } from "../components/ui/NoahButton";
import SuccessAnimation from "../components/SuccessAnimation";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";

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
          <View>
            <Text className="text-muted-foreground">Destination:</Text>
            <Text
              className="text-foreground font-semibold"
              ellipsizeMode="middle"
              numberOfLines={1}
            >
              {parsedResult.destination}
            </Text>
          </View>
          {parsedResult.txid && (
            <View className="mt-2">
              <Text className="text-muted-foreground">Transaction ID:</Text>
              <Text
                className="text-foreground font-semibold"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {parsedResult.txid}
              </Text>
            </View>
          )}
          {parsedResult.preimage && (
            <View className="mt-2">
              <Text className="text-muted-foreground">Preimage:</Text>
              <Text
                className="text-foreground font-semibold"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {parsedResult.preimage}
              </Text>
            </View>
          )}
        </CardContent>
      </Card>
      <NoahButton onPress={handleDone} className="w-full mt-8">
        Done
      </NoahButton>
    </NoahSafeAreaView>
  );
};
