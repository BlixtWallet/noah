import React from "react";
import { View, Pressable, Keyboard, TouchableWithoutFeedback } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "./ui/text";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { NoahButton } from "./ui/NoahButton";

type SendFormProps = {
  destination: string;
  setDestination: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  isAmountEditable: boolean;
  comment: string;
  setComment: (value: string) => void;
  handleSend: () => void;
  isSending: boolean;
  error: Error | null;
  errorMessage: string;
  handleDone: () => void;
  handleScanPress: () => void;
  parsedResult: { success: boolean } | null;
};

export const SendForm: React.FC<SendFormProps> = ({
  destination,
  setDestination,
  amount,
  setAmount,
  isAmountEditable,
  comment,
  setComment,
  handleSend,
  isSending,
  error,
  errorMessage,
  handleDone,
  handleScanPress,
  parsedResult,
}) => {
  const navigation = useNavigation();

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View className="flex-1 p-4">
        <View className="flex-row items-center justify-between mb-8">
          <View className="flex-row items-center">
            <Pressable onPress={() => navigation.goBack()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">Send</Text>
          </View>
          <Pressable onPress={handleScanPress}>
            <Icon name="scan" size={28} color="white" />
          </Pressable>
        </View>

        <View className="space-y-4">
          <View>
            <Text className="text-lg text-muted-foreground mb-2">Destination</Text>
            <Input
              value={destination}
              onChangeText={setDestination}
              placeholder="Lightning / Onchain / Ark / LN Address"
              className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <View>
            <Text className="text-lg text-muted-foreground mb-2">Amount (sats)</Text>
            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              keyboardType="numeric"
              className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
              editable={isAmountEditable}
            />
          </View>
          <View>
            <Text className="text-lg text-muted-foreground mb-2">Comment (Optional)</Text>
            <Input
              value={comment}
              onChangeText={setComment}
              placeholder="Add a note"
              className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
            />
          </View>
        </View>

        <NoahButton onPress={handleSend} isLoading={isSending} className="mt-8">
          Send
        </NoahButton>

        {(error || (parsedResult && !parsedResult.success)) && (
          <View className="mt-8 p-4 bg-destructive rounded-lg items-center">
            <Text className="text-lg font-bold text-destructive-foreground mb-2">Error</Text>
            <Text className="text-base text-center text-destructive-foreground">
              {error ? errorMessage : "The transaction failed. Please try again."}
            </Text>
            <Button onPress={handleDone} variant="secondary" className="mt-4">
              <Text>Try Again</Text>
            </Button>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};
