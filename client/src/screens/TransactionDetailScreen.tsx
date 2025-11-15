import { View, Pressable } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { copyToClipboard } from "../lib/clipboardUtils";
import { type Transaction } from "../types/transaction";
import { useState } from "react";
import { COLORS } from "~/lib/styleConstants";
import { formatBip177 } from "~/lib/utils";

const TransactionDetailRow = ({
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

const TransactionDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { transaction } = route.params as { transaction: Transaction };

  const fiatAmount = transaction.btcPrice
    ? (transaction.amount * 0.00000001 * transaction.btcPrice).toFixed(2)
    : "N/A";
  const bitcoinPrice = transaction.btcPrice ? transaction.btcPrice.toLocaleString() : "N/A";

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">{transaction.type}</Text>
        </View>

        <View className="items-center my-8">
          <Text className="text-4xl font-bold text-foreground">
            {formatBip177(transaction.amount)}
          </Text>
          <Text className="text-xl text-muted-foreground">${fiatAmount}</Text>
        </View>

        <View className="bg-card p-4 rounded-lg mb-4">
          <TransactionDetailRow label="Bitcoin Price" value={`$${bitcoinPrice}`} />
          <TransactionDetailRow
            label="Amount"
            value={`${formatBip177(transaction.amount)} ($${fiatAmount})`}
          />
        </View>

        <View className="bg-card p-4 rounded-lg">
          {transaction.description ? (
            <TransactionDetailRow label="Note" value={transaction.description} />
          ) : null}
          <TransactionDetailRow
            label="Date & time"
            value={new Date(transaction.date).toLocaleString()}
          />
          <TransactionDetailRow label="Payment ID" value={transaction.id} copyable />
          {transaction.txid ? (
            <TransactionDetailRow label="Transaction ID" value={transaction.txid} copyable />
          ) : null}
          {transaction.preimage ? (
            <TransactionDetailRow label="Preimage" value={transaction.preimage} copyable />
          ) : null}
          {transaction.destination ? (
            <TransactionDetailRow label="Destination" value={transaction.destination} copyable />
          ) : null}
        </View>
      </View>
    </NoahSafeAreaView>
  );
};

export default TransactionDetailScreen;
