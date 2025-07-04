import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Pressable, Alert, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { NoahButton } from "../components/ui/NoahButton";
import { useBalance } from "../hooks/useWallet";
import { useBoardArk } from "../hooks/usePayments";
import Clipboard from "@react-native-clipboard/clipboard";
import { cn } from "../lib/utils";
import { COLORS } from "../lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";

type Vtxo = {
  id: string;
  amount_sat: number;
  vtxo_type: string;
  utxo: string;
  user_pubkey: string;
  asp_pubkey: string;
  expiry_height: number;
  exit_delta: number;
  spk: string;
};

type BoardingResponse = {
  funding_txid: string;
  vtxos: Vtxo[];
};

const DetailRow = ({
  label,
  value,
  isCopyable = false,
}: {
  label: string;
  value: string | number;
  isCopyable?: boolean;
}) => {
  const displayValue = String(value);

  const handleCopy = () => {
    Clipboard.setString(displayValue);
    Alert.alert("Copied to Clipboard", `${label} has been copied.`);
  };

  return (
    <View className="flex-row justify-between items-center py-2 border-b border-border/50">
      <Text className="text-muted-foreground text-base font-medium">{label}</Text>
      <Pressable disabled={!isCopyable} onPress={handleCopy} className="max-w-[60%]">
        <Text
          className={cn("text-foreground text-base text-right", isCopyable && "text-primary")}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {displayValue}
        </Text>
      </Pressable>
    </View>
  );
};

const BoardArkScreen = () => {
  const navigation = useNavigation();
  const { data: balance, isLoading: isBalanceLoading } = useBalance();
  const { mutate: boardArk, isPending: isBoarding, data: boardResult, error } = useBoardArk();

  const [amount, setAmount] = useState("");
  const [parsedData, setParsedData] = useState<BoardingResponse | null>(null);

  useEffect(() => {
    if (boardResult) {
      try {
        setParsedData(JSON.parse(boardResult));
      } catch (e) {
        console.error("Failed to parse boarding result:", e);
      }
    }
  }, [boardResult]);

  const onchainBalance = balance?.onchain ?? 0;

  const handleBoard = () => {
    const amountSat = parseInt(amount, 10);
    if (isNaN(amountSat) || amountSat <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount to board.");
      return;
    }
    if (amountSat > onchainBalance) {
      Alert.alert("Insufficient Funds", "The amount exceeds your on-chain balance.");
      return;
    }
    setParsedData(null);
    boardArk(amountSat);
  };

  const handleCopyToClipboard = (value: string) => {
    Clipboard.setString(value);
    Alert.alert("Copied!", "TXID copied to clipboard.");
  };

  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="p-4"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Board Ark</Text>
        </View>

        <View className="mb-8">
          <Text className="text-lg text-muted-foreground">Confirmed On-chain Balance</Text>
          {isBalanceLoading ? (
            <ActivityIndicator color={COLORS.BITCOIN_ORANGE} className="mt-2" />
          ) : (
            <Text className="text-3xl font-bold text-foreground mt-1">
              {onchainBalance.toLocaleString()} sats
            </Text>
          )}
        </View>

        <View className="mb-4">
          <Text className="text-lg text-muted-foreground mb-2">Amount to Board</Text>
          <View className="flex-row items-center">
            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount in sats"
              keyboardType="numeric"
              className="flex-1 border-border bg-card p-4 rounded-lg text-foreground"
            />
            <Button
              variant="outline"
              onPress={() => setAmount(String(onchainBalance))}
              className="ml-2"
            >
              <Text>Max</Text>
            </Button>
          </View>
        </View>

        <NoahButton
          onPress={handleBoard}
          isLoading={isBoarding}
          disabled={isBoarding || !amount || onchainBalance === 0}
          className="mt-8"
        >
          Board Ark
        </NoahButton>

        {parsedData && (
          <View className="mt-8 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-green-500">Boarding Transaction Sent!</CardTitle>
                <CardDescription>Funding TXID</CardDescription>
              </CardHeader>
              <CardContent>
                <Pressable onPress={() => handleCopyToClipboard(parsedData.funding_txid)}>
                  <Text
                    className="text-base text-primary break-words"
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {parsedData.funding_txid}
                  </Text>
                </Pressable>
              </CardContent>
            </Card>

            <Text className="text-xl font-bold text-foreground pt-4">vTXOs Created</Text>
            {parsedData.vtxos.map((vtxo) => (
              <Card key={vtxo.id}>
                <CardHeader>
                  <CardTitle className="text-lg" numberOfLines={1} ellipsizeMode="middle">
                    ID: {vtxo.id}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailRow label="Amount" value={`${vtxo.amount_sat.toLocaleString()} sats`} />
                  <DetailRow label="Type" value={vtxo.vtxo_type} />
                  <DetailRow label="UTXO" value={vtxo.utxo} isCopyable />
                  <DetailRow label="User Pubkey" value={vtxo.user_pubkey} isCopyable />
                  <DetailRow label="ASP Pubkey" value={vtxo.asp_pubkey} isCopyable />
                  <DetailRow label="Expiry Height" value={vtxo.expiry_height} />
                  <DetailRow label="Exit Delta" value={vtxo.exit_delta} />
                  <DetailRow label="SPK" value={vtxo.spk} />
                </CardContent>
              </Card>
            ))}
          </View>
        )}
        {error && (
          <Card className="mt-8 bg-destructive">
            <CardHeader>
              <CardTitle className="text-destructive-foreground">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-base text-center text-destructive-foreground">
                {errorMessage}
              </Text>
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default BoardArkScreen;
