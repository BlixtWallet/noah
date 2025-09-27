import { View, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Share from "react-native-share";
import { ConfirmationDialog } from "~/components/ConfirmationDialog";
import { useState, useEffect } from "react";
import { FlashList } from "@shopify/flash-list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { Label } from "~/components/ui/label";
import { useRouter } from "expo-router";
import { Result, ResultAsync } from "neverthrow";
import { CACHES_DIRECTORY_PATH } from "~/constants";
import RNFSTurbo from "react-native-fs-turbo";
import {
  getOnboardingRequests,
  getOffboardingRequests,
  type OnboardingRequest,
  type OffboardingRequest,
} from "~/lib/transactionsDb";
import logger from "~/lib/log";

const log = logger("BoardingTransactionsScreen");

type BoardingTransaction = (OnboardingRequest | OffboardingRequest) & {
  type: "onboarding" | "offboarding";
};

const BoardingTransactionsScreen = () => {
  const router = useRouter();
  const [transactions, setTransactions] = useState<BoardingTransaction[]>([]);
  const [filter, setFilter] = useState<"all" | "onboarding" | "offboarding">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load boarding transactions
  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const [onboardingResult, offboardingResult] = await Promise.all([
        getOnboardingRequests(),
        getOffboardingRequests(),
      ]);

      const boardingTransactions: BoardingTransaction[] = [];

      if (onboardingResult.isOk()) {
        const onboardingTxs = onboardingResult.value.map((tx) => ({
          ...tx,
          type: "onboarding" as const,
        }));
        boardingTransactions.push(...onboardingTxs);
      } else {
        log.e("Failed to load onboarding requests", [onboardingResult.error]);
      }

      if (offboardingResult.isOk()) {
        const offboardingTxs = offboardingResult.value.map((tx) => ({
          ...tx,
          type: "offboarding" as const,
        }));
        boardingTransactions.push(...offboardingTxs);
      } else {
        log.e("Failed to load offboarding requests", [offboardingResult.error]);
      }

      // Sort by date descending
      boardingTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(boardingTransactions);
      setIsLoading(false);
    } catch (error) {
      log.e("Failed to load boarding transactions", [error]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleDeleteRequest = (id: string) => {
    setSelectedTransactionId(id);
    setDialogOpen(true);
  };

  const deleteTransaction = async () => {
    if (selectedTransactionId) {
      // TODO: Implement delete functionality for boarding transactions
      // For now, just close the dialog
      setSelectedTransactionId(null);
      setDialogOpen(false);
    }
  };

  const exportToCSV = async () => {
    const csvHeader = "Request ID,Date,Type,Status,Onchain TXID\n";
    const csvRows = filteredTransactions
      .map((transaction) => {
        const date = new Date(transaction.date).toISOString().split("T")[0];
        const type = transaction.type === "onboarding" ? "Onboarding" : "Offboarding";
        const status = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
        const onchainTxid = transaction.onchain_txid || "";

        return `${transaction.request_id},${date},${type},${status},${onchainTxid}`;
      })
      .join("\n");

    const csvContent = csvHeader + csvRows;
    const filename = `noah_boarding_transactions_${new Date().toISOString().split("T")[0]}.csv`;
    const filePath = `${CACHES_DIRECTORY_PATH}/${filename}`;

    const writeFileResult = Result.fromThrowable(
      () => {
        return RNFSTurbo.writeFile(filePath, csvContent, "utf8");
      },
      (e) => e as Error,
    )();

    if (writeFileResult.isErr()) {
      console.error("Error writing CSV file:", writeFileResult.error);
      return;
    }

    const shareResult = await ResultAsync.fromPromise(
      Share.open({
        title: "Export Boarding Transactions",
        url: `file://${filePath}`,
        type: "text/csv",
        filename: filename,
        subject: "Noah Wallet Boarding Transaction Export",
      }),
      (e) => e as Error,
    );

    if (shareResult.isErr()) {
      if (!shareResult.error.message.includes("User did not share")) {
        console.error("Error sharing CSV:", shareResult.error);
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
    filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  const getIconForType = (type: BoardingTransaction["type"]) => {
    switch (type) {
      case "onboarding":
        return "log-in-outline";
      case "offboarding":
        return "log-out-outline";
      default:
        return "boat-outline";
    }
  };

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NoahSafeAreaView className="flex-1 bg-background">
        <ConfirmationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Delete Transaction"
          description="Are you sure you want to delete this boarding transaction? This action cannot be undone."
          onConfirm={deleteTransaction}
          onCancel={onCancelDelete}
          confirmText="Delete"
        />
        <View className="p-4 flex-1">
          <View className="flex-row items-center justify-between mb-8">
            <View className="flex-row items-center">
              <Pressable onPress={() => router.back()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color="white" />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">Boarding History</Text>
            </View>
            <Pressable onPress={exportToCSV} className="p-2">
              <Icon name="download-outline" size={24} color="white" />
            </Pressable>
          </View>
          <View className="flex-row justify-around mb-4">
            {(["all", "onboarding", "offboarding"] as const).map((f) => (
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
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted-foreground">Loading boarding transactions...</Text>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Icon name="boat-outline" size={48} color="#666" />
              <Text className="text-muted-foreground mt-4 text-center">
                No boarding transactions found
              </Text>
            </View>
          ) : (
            <FlashList
              data={filteredTransactions}
              renderItem={({ item }: { item: BoardingTransaction }) => (
                <View style={{ marginBottom: 8 }}>
                  <Pressable
                    onPress={() =>
                      router.push(
                        `/(tabs)/(home)/boarding-transaction-detail?transaction=${encodeURIComponent(JSON.stringify(item))}`,
                      )
                    }
                    onLongPress={() => handleDeleteRequest(item.request_id)}
                  >
                    <View className="flex-row items-center p-4 bg-card rounded-lg">
                      <View className="mr-4">
                        <Icon
                          name={getIconForType(item.type)}
                          size={24}
                          color={item.type === "onboarding" ? "green" : "orange"}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row justify-between items-center">
                          <Label className="text-foreground text-base">
                            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                          </Label>
                          <Text className={`text-sm font-medium ${getStatusColor(item.status)}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-sm mt-1">
                          {new Date(item.date).toLocaleString()}
                        </Text>
                        {item.onchain_txid && (
                          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                            TXID: {item.onchain_txid}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </View>
              )}
              keyExtractor={(item: BoardingTransaction) => item.request_id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 50 }}
            />
          )}
        </View>
      </NoahSafeAreaView>
    </GestureHandlerRootView>
  );
};

export default BoardingTransactionsScreen;
