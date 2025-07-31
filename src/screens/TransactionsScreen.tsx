import { View, Pressable } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { useTransactionStore } from "../store/transactionStore";
import { useState, useRef } from "react";
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
  const { transactions, removeTransaction } = useTransactionStore();
  const [filter, setFilter] = useState<PaymentTypes | "all" | "Lightning">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const swipeableRefs = useRef<Record<string, SwipeableMethods>>({});

  const handleDeleteRequest = (id: string) => {
    setSelectedTransactionId(id);
    setDialogOpen(true);
  };

  const deleteTransaction = () => {
    if (selectedTransactionId) {
      removeTransaction(selectedTransactionId);
      setSelectedTransactionId(null);
      setDialogOpen(false);
    }
  };

  const renderRightActions = (itemId: string) => {
    function DeleteAction() {
      return (
        <Pressable
          onPress={() => handleDeleteRequest(itemId)}
          className="w-20 bg-red-500 justify-center items-center"
        >
          <Icon name="trash-outline" size={24} color="white" />
        </Pressable>
      );
    }
    return DeleteAction;
  };

  const onCancelDelete = () => {
    if (selectedTransactionId && swipeableRefs.current[selectedTransactionId]) {
      swipeableRefs.current[selectedTransactionId].close();
    }
    setDialogOpen(false);
    setSelectedTransactionId(null);
  };

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NoahSafeAreaView className="flex-1 bg-background">
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this transaction? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row space-x-2">
              <AlertDialogCancel onPress={onCancelDelete} className="flex-1">
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onPress={deleteTransaction}
                className="flex-1"
              >
                <Text>Delete</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
                  {f === "Arkoor"
                    ? "Ark"
                    : f === "all"
                      ? "All"
                      : f === "Lightning"
                        ? "Lightning"
                        : f}
                </Text>
              </Pressable>
            ))}
          </View>
          <LegendList
            data={filteredTransactions}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 8 }}>
                <Swipeable
                  ref={(ref) => {
                    if (ref) {
                      swipeableRefs.current[item.id] = ref;
                    } else {
                      delete swipeableRefs.current[item.id];
                    }
                  }}
                  renderRightActions={renderRightActions(item.id)}
                  overshootRight={false}
                  rightThreshold={40}
                >
                  <Pressable
                    onPress={() => navigation.navigate("TransactionDetail", { transaction: item })}
                  >
                    <View className="flex-row items-center p-4 bg-card rounded-lg">
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
                            {item.type === "Bolt11" || item.type === "Lnurl"
                              ? "Lightning"
                              : item.type}
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
                </Swipeable>
              </View>
            )}
            keyExtractor={(item) => item.id}
            recycleItems
          />
        </View>
      </NoahSafeAreaView>
    </GestureHandlerRootView>
  );
};

export default TransactionsScreen;
