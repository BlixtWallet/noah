import { View, Pressable } from "react-native";
import { useTransactionStore } from "../store/transactionStore";
import { useState } from "react";
import { LegendList } from "@legendapp/list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import Clipboard from "@react-native-clipboard/clipboard";
import { type Transaction, type PaymentTypes } from "../types/transaction";
import { Label } from "~/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useNavigation } from "@react-navigation/native";

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

  const onCopy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
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
            <Icon name="checkmark-circle-outline" size={16} color="green" />
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

const TransactionsScreen = () => {
  const navigation = useNavigation();
  const { transactions } = useTransactionStore();
  const [filter, setFilter] = useState<PaymentTypes | "all">("all");

  const filteredTransactions =
    filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  const getIconForType = (type: Transaction["type"]) => {
    switch (type) {
      case "Bolt11":
        return "flash-outline";
      case "Arkoor":
        return "boat-outline";
      case "Lnurl":
        return "globe-outline";
      case "Onchain":
        return "cube-outline";
      default:
        return "cash-outline";
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Receive Funds</Text>
        </View>
        <View className="flex-row justify-around mb-4">
          {(["all", "Bolt11", "Arkoor", "Lnurl", "Onchain"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className={`px-3 py-1 rounded-full ${filter === f ? "bg-primary" : "bg-card"}`}
            >
              <Text
                className={`text-sm ${
                  filter === f ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {f === "Arkoor" ? "Ark" : f === "all" ? "All" : f}
              </Text>
            </Pressable>
          ))}
        </View>
        <Accordion type="multiple" className="w-full flex-1">
          <LegendList
            data={filteredTransactions}
            renderItem={({ item }) => (
              <AccordionItem value={item.id} className="border-b-0">
                <AccordionTrigger>
                  <View className="flex-row items-center p-4 bg-card rounded-lg mb-2">
                    <View className="mr-4">
                      <Icon
                        name={getIconForType(item.type)}
                        size={24}
                        color={item.direction === "outgoing" ? "red" : "green"}
                      />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row justify-between">
                        <Label className="text-foreground text-base">{item.type}</Label>
                        <Text
                          className={`text-base font-bold ${
                            item.direction === "outgoing" ? "text-red-500" : "text-green-500"
                          }`}
                        >
                          {item.direction === "outgoing" ? "-" : "+"} {item.amount} sats
                        </Text>
                      </View>
                      <Text className="text-muted-foreground text-sm mt-1">
                        {new Date(item.date).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </AccordionTrigger>
                <AccordionContent>
                  <View className="bg-card/70 p-4 rounded-lg -mt-2 mb-2">
                    <TransactionDetailRow label="Payment ID" value={item.id} copyable />
                    {item.description ? (
                      <TransactionDetailRow label="Description" value={item.description} />
                    ) : null}
                    {item.txid ? (
                      <TransactionDetailRow label="Transaction ID" value={item.txid} copyable />
                    ) : null}
                    {item.preimage ? (
                      <TransactionDetailRow label="Preimage" value={item.preimage} copyable />
                    ) : null}
                    {item.destination ? (
                      <TransactionDetailRow label="Destination" value={item.destination} copyable />
                    ) : null}
                  </View>
                </AccordionContent>
              </AccordionItem>
            )}
            keyExtractor={(item) => item.id}
            recycleItems
          />
        </Accordion>
      </View>
    </NoahSafeAreaView>
  );
};

export default TransactionsScreen;
