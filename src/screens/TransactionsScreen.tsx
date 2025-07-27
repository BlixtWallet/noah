import { View, Pressable } from "react-native";
import { useTransactionStore } from "../store/transactionStore";
import { useState } from "react";
import { LegendList } from "@legendapp/list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { type Transaction, type PaymentTypes } from "../types/transaction";
import { Label } from "~/components/ui/label";
import { useNavigation } from "@react-navigation/native";
import { HomeStackParamList } from "~/Navigators";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const TransactionsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { transactions } = useTransactionStore();
  const [filter, setFilter] = useState<PaymentTypes | "all" | "Lightning">("all");

  const filteredTransactions =
    filter === "all"
      ? transactions
      : filter === "Lightning"
        ? transactions.filter((t) => t.type === "Bolt11" || t.type === "Lnurl")
        : transactions.filter((t) => t.type === filter);

  const getIconForType = (type: Transaction["type"]) => {
    switch (type) {
      case "Bolt11":
      case "Lnurl":
        return "flash-outline";
      case "Arkoor":
        return "boat-outline";
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
          <Text className="text-2xl font-bold text-foreground">Transactions</Text>
        </View>
        <View className="flex-row justify-around mb-4">
          {(["all", "Lightning", "Arkoor", "Onchain"] as const).map((f) => (
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
                {f === "Arkoor" ? "Ark" : f === "all" ? "All" : f === "Lightning" ? "Lightning" : f}
              </Text>
            </Pressable>
          ))}
        </View>
        <LegendList
          data={filteredTransactions}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("TransactionDetail", { transaction: item })}
            >
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
                    <Label className="text-foreground text-base">
                      {item.type === "Bolt11" || item.type === "Lnurl" ? "Lightning" : item.type}
                    </Label>
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
