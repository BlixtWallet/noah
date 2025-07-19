import { View, Pressable, Clipboard } from "react-native";
import { useTransactionStore } from "../store/transactionStore";
import { useState } from "react";
import { LegendList } from "@legendapp/list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { type Transaction, type PaymentTypes } from "../types/transaction";
import { Label } from "~/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";

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
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-4">
          <Text className="text-xl font-bold text-foreground">Transactions</Text>
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
              <AccordionItem value={item.id}>
                <AccordionTrigger>
                  <View className="flex-row justify-between items-center p-3 bg-card rounded-lg mb-1">
                    <View className="flex-row items-center">
                      <View className="mr-4">
                        <Icon
                          name={getIconForType(item.type)}
                          size={20}
                          color={item.direction === "outgoing" ? "red" : "green"}
                        />
                      </View>
                      <View>
                        <Label className="text-foreground text-base">{item.type}</Label>
                        <Text className="text-muted-foreground text-sm mt-1">
                          {new Date(item.date).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className={`text-base font-bold ${
                        item.direction === "outgoing" ? "text-red-500" : "text-green-500"
                      }`}
                    >
                      {item.direction === "outgoing" ? "-" : "+"} {item.amount} sats
                    </Text>
                  </View>
                </AccordionTrigger>
                <AccordionContent>
                  <View className="p-3 bg-card rounded-lg">
                    <Pressable onPress={() => Clipboard.setString(item.id)}>
                      <Text className="text-foreground text-sm">
                        ID: {`${item.id.slice(0, 20)}...`}
                      </Text>
                    </Pressable>
                    {item.description && (
                      <Text className="text-foreground text-sm">
                        Description: {item.description}
                      </Text>
                    )}
                    {item.txid && (
                      <Pressable onPress={() => Clipboard.setString(item.txid!)}>
                        <Text className="text-foreground text-sm">
                          Transaction ID: {`${item.txid.slice(0, 20)}...`}
                        </Text>
                      </Pressable>
                    )}
                    {item.preimage && (
                      <Pressable onPress={() => Clipboard.setString(item.preimage!)}>
                        <Text className="text-foreground text-sm">
                          Preimage: {`${item.preimage.slice(0, 20)}...`}
                        </Text>
                      </Pressable>
                    )}
                    {item.destination && (
                      <Pressable onPress={() => Clipboard.setString(item.destination!)}>
                        <Text className="text-foreground text-sm">
                          Destination: {`${item.destination.slice(0, 20)}...`}
                        </Text>
                      </Pressable>
                    )}
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
