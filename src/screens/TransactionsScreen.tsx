import { View, Pressable } from "react-native";
import { useTransactionStore } from "../store/transactionStore";
import { useState } from "react";
import { LegendList } from "@legendapp/list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { type Transaction, type PaymentTypes } from "../types/transaction";
import { Label } from "~/components/ui/label";

const TransactionsScreen = () => {
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
      <View className="p-4">
        <View className="flex-row items-center mb-4">
          <Text className="text-2xl font-bold text-foreground">Transactions</Text>
        </View>
        <View className="flex-row justify-around mb-4">
          <Pressable onPress={() => setFilter("all")}>
            <Text className={filter === "all" ? "font-bold" : ""}>All</Text>
          </Pressable>
          <Pressable onPress={() => setFilter("Bolt11")}>
            <Text className={filter === "Bolt11" ? "font-bold" : ""}>Bolt11</Text>
          </Pressable>
          <Pressable onPress={() => setFilter("Arkoor")}>
            <Text className={filter === "Arkoor" ? "font-bold" : ""}>Ark</Text>
          </Pressable>
          <Pressable onPress={() => setFilter("Lnurl")}>
            <Text className={filter === "Lnurl" ? "font-bold" : ""}>LNURL</Text>
          </Pressable>
          <Pressable onPress={() => setFilter("Onchain")}>
            <Text className={filter === "Onchain" ? "font-bold" : ""}>On-chain</Text>
          </Pressable>
        </View>
        <LegendList
          data={filteredTransactions}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                /* Handle item press if needed */
              }}
              className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-2"
            >
              <View className="flex-row items-center">
                <View className="mr-4">
                  <Icon
                    name={getIconForType(item.type)}
                    size={24}
                    color={item.direction === "outgoing" ? "red" : "green"}
                  />
                </View>
                <View>
                  <Label className="text-foreground text-lg">{item.type}</Label>
                  <Text className="text-muted-foreground text-base mt-1">
                    {new Date(item.date).toLocaleString()}
                  </Text>
                </View>
              </View>
              <Text
                className={`text-lg font-bold ${
                  item.direction === "outgoing" ? "text-red-500" : "text-green-500"
                }`}
              >
                {item.direction === "outgoing" ? "-" : "+"} {item.amount} sats
              </Text>
            </Pressable>
          )}
          keyExtractor={(item) => item.id}
          recycleItems
        />
      </View>
    </NoahSafeAreaView>
  );
};

export default TransactionsScreen;
