import { View, Pressable } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { copyToClipboard } from "../lib/clipboardUtils";
import { useState } from "react";
import { COLORS } from "~/lib/styleConstants";

type BoardingTransaction = {
  request_id: string;
  date: string;
  status: "pending" | "completed" | "failed";
  onchain_txid?: string;
  type: "onboarding" | "offboarding";
};

const BoardingTransactionDetailRow = ({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await copyToClipboard(value, {
      onCopy: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      },
    });
  };

  return (
    <View className="flex-row justify-between items-center py-3 border-b border-border/10 last:border-b-0">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      {copyable ? (
        <Pressable onPress={onCopy} className="flex-row items-center gap-x-2 flex-shrink-0">
          <Text
            className="text-foreground text-sm text-right"
            ellipsizeMode="middle"
            numberOfLines={1}
            style={{ maxWidth: 150 }}
          >
            {value}
          </Text>
          {copied ? (
            <Icon name="checkmark-circle-outline" size={16} color={COLORS.SUCCESS} />
          ) : (
            <Icon name="copy-outline" size={16} color="white" />
          )}
        </Pressable>
      ) : (
        <Text
          className="text-foreground text-sm text-right"
          ellipsizeMode="tail"
          numberOfLines={2}
          style={{ maxWidth: 200 }}
        >
          {value}
        </Text>
      )}
    </View>
  );
};

const BoardingTransactionDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { transaction } = route.params as { transaction: BoardingTransaction };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-500";
      case "pending":
        return "text-yellow-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "checkmark-circle-outline";
      case "pending":
        return "time-outline";
      case "failed":
        return "close-circle-outline";
      default:
        return "help-circle-outline";
    }
  };

  const getTypeIcon = (type: string) => {
    return type === "onboarding" ? "log-in-outline" : "log-out-outline";
  };

  const getTypeColor = (type: string) => {
    return type === "onboarding" ? "#22c55e" : "#f97316";
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">
            {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Details
          </Text>
        </View>

        <View className="items-center my-8">
          <View className="mb-4">
            <Icon
              name={getTypeIcon(transaction.type)}
              size={64}
              color={getTypeColor(transaction.type)}
            />
          </View>
          <Text className="text-3xl font-bold text-foreground mb-2">
            {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
          </Text>
          <View className="flex-row items-center">
            <Icon
              name={getStatusIcon(transaction.status)}
              size={20}
              color={
                getStatusColor(transaction.status).includes("green")
                  ? "#22c55e"
                  : getStatusColor(transaction.status).includes("yellow")
                    ? "#eab308"
                    : getStatusColor(transaction.status).includes("red")
                      ? "#ef4444"
                      : "#6b7280"
              }
            />
            <Text className={`text-xl font-medium ml-2 ${getStatusColor(transaction.status)}`}>
              {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
            </Text>
          </View>
        </View>

        <View className="bg-card p-4 rounded-lg mb-4">
          <BoardingTransactionDetailRow
            label="Request ID"
            value={transaction.request_id}
            copyable
          />
          <BoardingTransactionDetailRow
            label="Date & time"
            value={new Date(transaction.date).toLocaleString()}
          />
          <BoardingTransactionDetailRow
            label="Type"
            value={transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
          />
          <BoardingTransactionDetailRow
            label="Status"
            value={transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
          />
        </View>

        {transaction.onchain_txid && (
          <View className="bg-card p-4 rounded-lg mb-4">
            <Text className="text-foreground text-lg font-semibold mb-3">Onchain Transaction</Text>
            <BoardingTransactionDetailRow
              label="Transaction ID"
              value={transaction.onchain_txid}
              copyable
            />
          </View>
        )}

        <View className="bg-card p-4 rounded-lg">
          <Text className="text-foreground text-lg font-semibold mb-3">Description</Text>
          <Text className="text-muted-foreground text-sm">
            {transaction.type === "onboarding"
              ? "Onboarding transaction to enter the Ark network. Your Bitcoin was moved from the onchain wallet to the offchain Ark balance."
              : "Offboarding transaction to exit the Ark network. Your Ark balance was converted back to onchain Bitcoin."}
          </Text>
          {transaction.status === "pending" && (
            <Text className="text-yellow-500 text-sm mt-2">
              {transaction.type === "onboarding"
                ? "This onboarding request is being processed. It will be completed when the next Ark round starts."
                : "This offboarding request is being processed. It will be completed when the next Ark round starts."}
            </Text>
          )}
        </View>
      </View>
    </NoahSafeAreaView>
  );
};

export default BoardingTransactionDetailScreen;
