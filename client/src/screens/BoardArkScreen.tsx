import React, { useState, useEffect } from "react";
import {
  View,
  ActivityIndicator,
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { NoahButton } from "../components/ui/NoahButton";
import { useBalance } from "../hooks/useWallet";
import {
  useBoardAllAmountArk,
  useBoardArk,
  useOffboardAllArk,
  useGenerateOnchainAddress,
} from "../hooks/usePayments";
import Clipboard from "@react-native-clipboard/clipboard";
import { cn } from "../lib/utils";
import { COLORS } from "../lib/styleConstants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useAlert } from "~/contexts/AlertProvider";
import { Result } from "neverthrow";

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

type Flow = "onboard" | "offboard";

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

  const { showAlert } = useAlert();

  const handleCopy = () => {
    Clipboard.setString(displayValue);
    showAlert({ title: "Copied to Clipboard", description: `${label} has been copied.` });
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
  const { showAlert } = useAlert();
  const navigation = useNavigation();
  const { data: balance, isLoading: isBalanceLoading } = useBalance();
  const {
    mutate: boardArk,
    isPending: isBoarding,
    data: boardResult,
    error: boardError,
  } = useBoardArk();
  const {
    mutate: boardAllArk,
    isPending: isBoardingAll,
    data: boardAllResult,
    error: boardAllError,
  } = useBoardAllAmountArk();
  const {
    mutateAsync: offboardAllArk,
    isPending: isOffboarding,
    data: offboardResult,
    error: offboardError,
  } = useOffboardAllArk();
  const { mutateAsync: generateOnchainAddress } = useGenerateOnchainAddress();

  const [flow, setFlow] = useState<Flow>("onboard");
  const [amount, setAmount] = useState("");
  const [isMaxAmount, setIsMaxAmount] = useState(false);
  const [offboardAddress, setOffboardAddress] = useState("");
  const [parsedData, setParsedData] = useState<BoardingResponse | null>(null);

  useEffect(() => {
    if (boardResult) {
      const result = Result.fromThrowable(JSON.parse)(boardResult);
      if (result.isOk()) {
        setParsedData(result.value);
      } else {
        console.error("Failed to parse boarding result:", result.error);
      }
    }
  }, [boardResult]);

  useEffect(() => {
    if (boardAllResult) {
      const result = Result.fromThrowable(JSON.parse)(boardAllResult);
      if (result.isOk()) {
        setParsedData(result.value);
      } else {
        console.error("Failed to parse boarding result:", result.error);
      }
    }
  }, [boardAllResult]);

  useEffect(() => {
    if (offboardResult) {
      const result = Result.fromThrowable(JSON.parse)(offboardResult);
      if (result.isOk()) {
        setParsedData(result.value);
      } else {
        console.error("Failed to parse offboarding result:", result.error);
      }
    }
  }, [offboardResult]);

  const onchainBalance = balance?.onchain.confirmed ?? 0;
  const offchainBalance = balance?.offchain.spendable ?? 0;

  const handlePress = async () => {
    if (flow === "onboard") {
      handleBoard();
    } else {
      await handleOffboard();
    }
  };

  const handleOffboard = async () => {
    setParsedData(null);
    let address = offboardAddress;
    if (!address) {
      const generatedAddress = await generateOnchainAddress();
      if (generatedAddress) {
        address = generatedAddress;
      } else {
        showAlert({
          title: "Error",
          description: "Could not generate an on-chain address.",
        });
        return;
      }
    }
    offboardAllArk(address);
  };

  const handleBoard = () => {
    if (isMaxAmount) {
      setParsedData(null);
      boardAllArk();
      return;
    }
    const amountSat = parseInt(amount, 10);
    if (isNaN(amountSat) || amountSat <= 0) {
      showAlert({
        title: "Invalid Amount",
        description: "Please enter a valid amount to board.",
      });
      return;
    }
    if (amountSat > onchainBalance) {
      showAlert({
        title: "Insufficient Funds",
        description: "The amount exceeds your on-chain balance.",
      });
      return;
    }
    setParsedData(null);
    boardArk(amountSat);
  };

  const handleCopyToClipboard = (value: string) => {
    Clipboard.setString(value);
    showAlert({ title: "Copied!", description: "TXID copied to clipboard." });
  };

  const errorMessage =
    (boardError instanceof Error ? boardError.message : String(boardError ?? "")) ||
    (boardAllError instanceof Error ? boardAllError.message : String(boardAllError ?? "")) ||
    (offboardError instanceof Error ? offboardError.message : String(offboardError ?? ""));

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          className="p-4"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center mb-8">
            <Pressable onPress={() => navigation.goBack()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">
              {flow === "onboard" ? "Board Ark" : "Offboard Ark"}
            </Text>
          </View>

          <View className="flex flex-row justify-around rounded-lg bg-muted p-1 mb-8">
            <Pressable
              onPress={() => setFlow("onboard")}
              className={cn(
                "flex-1 items-center justify-center rounded-md p-2",
                flow === "onboard" && "bg-background",
              )}
            >
              <Text
                className={cn(
                  "font-bold",
                  flow === "onboard" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Board the Ark
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFlow("offboard")}
              className={cn(
                "flex-1 items-center justify-center rounded-md p-2",
                flow === "offboard" && "bg-background",
              )}
            >
              <Text
                className={cn(
                  "font-bold",
                  flow === "offboard" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Offboard Ark
              </Text>
            </Pressable>
          </View>

          {flow === "onboard" ? (
            <>
              <Text className="text-muted-foreground text-center mb-8">
                Swap you onchain bitcoin and enter the Ark network for fast, cheap offchain
                transactions.
              </Text>
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
                    onChangeText={(text) => {
                      setAmount(text);
                      setIsMaxAmount(false);
                    }}
                    placeholder="Enter amount in sats"
                    keyboardType="numeric"
                    className="flex-1 border-border bg-card p-4 rounded-lg text-foreground"
                  />
                  <Button
                    variant="outline"
                    onPress={() => {
                      setAmount(String(onchainBalance));
                      setIsMaxAmount(true);
                    }}
                    className="ml-2"
                  >
                    <Text>Max</Text>
                  </Button>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text className="text-muted-foreground text-center mb-8">
                Swap your VTXOS by exiting Ark back to onchain bitcoin.
              </Text>
              <View className="mb-8">
                <Text className="text-lg text-muted-foreground">Confirmed Off-chain Balance</Text>
                {isBalanceLoading ? (
                  <ActivityIndicator color={COLORS.BITCOIN_ORANGE} className="mt-2" />
                ) : (
                  <Text className="text-3xl font-bold text-foreground mt-1">
                    {offchainBalance.toLocaleString()} sats
                  </Text>
                )}
              </View>
              <View className="mb-4">
                <Text className="text-lg text-muted-foreground mb-2">
                  Destination Address (optional)
                </Text>
                <Input
                  value={offboardAddress}
                  onChangeText={setOffboardAddress}
                  placeholder="Defaults to internal address"
                  className="border-border bg-card p-4 rounded-lg text-foreground"
                />
              </View>
            </>
          )}

          <NoahButton
            onPress={handlePress}
            isLoading={isBoarding || isBoardingAll || isOffboarding}
            disabled={
              isBoarding ||
              isBoardingAll ||
              isOffboarding ||
              (flow === "onboard" && (!amount || onchainBalance === 0)) ||
              (flow === "offboard" && offchainBalance === 0)
            }
            className="mt-8"
          >
            {flow === "onboard" ? "Board Ark" : "Offboard All"}
          </NoahButton>

          {parsedData && (
            <View className="mt-8 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-green-500">
                    {flow === "onboard" ? "Boarding" : "Offboarding"} Transaction Sent!
                  </CardTitle>
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
          {(boardError || boardAllError || offboardError) && (
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
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default BoardArkScreen;
