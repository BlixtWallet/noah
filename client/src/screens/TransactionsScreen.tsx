import { View, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Share from "react-native-share";
import { ConfirmationDialog } from "~/components/ConfirmationDialog";
import { useTransactionStore } from "../store/transactionStore";
import { useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { type Transaction, type PaymentTypes } from "../types/transaction";
import { Label } from "~/components/ui/label";
import { useNavigation } from "@react-navigation/native";
import { HomeStackParamList } from "~/Navigators";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Result, ResultAsync } from "neverthrow";
import { CACHES_DIRECTORY_PATH } from "~/constants";
import RNFSTurbo from "react-native-fs-turbo";
import logger from "~/lib/log";
import { formatBip177 } from "~/lib/utils";

const log = logger("TransactionsScreen");

const TransactionsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { transactions, removeTransaction } = useTransactionStore();
  const [filter, setFilter] = useState<PaymentTypes | "all" | "Lightning">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const handleDeleteRequest = (id: string) => {
    setSelectedTransactionId(id);
    setDialogOpen(true);
  };

  const deleteTransaction = async () => {
    if (selectedTransactionId) {
      await removeTransaction(selectedTransactionId);
      setSelectedTransactionId(null);
      setDialogOpen(false);
    }
  };

  const exportToCSV = async () => {
    const csvHeader =
      "Payment ID,Date,Type,Direction,Amount (₿),BTC Price,Transaction ID,Destination\n";
    const csvRows = filteredTransactions
      .map((transaction) => {
        const date = new Date(transaction.date).toISOString().split("T")[0];
        const type =
          transaction.type === "Bolt11" || transaction.type === "Lnurl"
            ? "Lightning"
            : transaction.type;
        const direction = transaction.direction === "outgoing" ? "Outgoing" : "Incoming";
        const amount =
          transaction.direction === "outgoing" ? -transaction.amount : transaction.amount;
        const id = transaction.id;
        const btcPrice = transaction.btcPrice;
        const txid = transaction.txid || "";
        const destination = transaction.destination;

        return `${id},${date},${type},${direction},${amount},${btcPrice},${txid},${destination}`;
      })
      .join("\n");

    const csvContent = csvHeader + csvRows;
    const filename = `noah_transactions_${new Date().toISOString().split("T")[0]}.csv`;
    const filePath = `${CACHES_DIRECTORY_PATH}/${filename}`;

    const writeFileResult = Result.fromThrowable(
      () => {
        return RNFSTurbo.writeFile(filePath, csvContent, "utf8");
      },
      (e) => e as Error,
    )();

    if (writeFileResult.isErr()) {
      log.e("Error writing CSV file:", [writeFileResult.error]);
      return;
    }

    const shareResult = await ResultAsync.fromPromise(
      Share.open({
        title: "Export Transactions",
        url: `file://${filePath}`,
        type: "text/csv",
        filename: filename,
        subject: "Noah Wallet Transaction Export",
      }),
      (e) => e as Error,
    );

    if (shareResult.isErr()) {
      if (!shareResult.error.message.includes("User did not share")) {
        log.e("Error sharing CSV:", [shareResult.error]);
      }
    }

    Result.fromThrowable(
      () => {
        return RNFSTurbo.unlink(filePath);
      },
      (e) => e as Error,
    )();
  };

  const onCancelDelete = () => {
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
        <ConfirmationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Delete Transaction"
          description="Are you sure you want to delete this transaction? This action cannot be undone."
          onConfirm={deleteTransaction}
          onCancel={onCancelDelete}
          confirmText="Delete"
        />
        <View className="p-4 flex-1">
          <View className="flex-row items-center justify-between mb-8">
            <View className="flex-row items-center">
              <Pressable onPress={() => navigation.goBack()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color="white" />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">Transactions</Text>
            </View>
            <Pressable onPress={exportToCSV} className="p-2">
              <Icon name="download-outline" size={24} color="white" />
            </Pressable>
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
          <FlashList
            data={filteredTransactions}
            renderItem={({ item }: { item: Transaction }) => (
              <View style={{ marginBottom: 8 }}>
                <Pressable
                  onPress={() => navigation.navigate("TransactionDetail", { transaction: item })}
                  onLongPress={() => handleDeleteRequest(item.id)}
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
                          {`${item.direction === "outgoing" ? "-" : "+"}${formatBip177(item.amount)}`}
                        </Text>
                      </View>
                      <Text className="text-muted-foreground text-sm mt-1">
                        {new Date(item.date).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            )}
            keyExtractor={(item: Transaction) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 50 }}
          />
        </View>
      </NoahSafeAreaView>
    </GestureHandlerRootView>
  );
};

export default TransactionsScreen;
