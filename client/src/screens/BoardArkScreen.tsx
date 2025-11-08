import React, { useState, useEffect } from "react";
import {
  View,
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import uuid from "react-native-uuid";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { validateBitcoinAddress } from "bip-321";
import { APP_VARIANT } from "../config";
import { NoahButton } from "../components/ui/NoahButton";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";
import { useBalance } from "../hooks/useWallet";
import { useBoardAllAmountArk, useBoardArk } from "../hooks/usePayments";
import { registerOffboardingRequest } from "../lib/api";
import { signMessage } from "../lib/crypto";
import { addOffboardingRequest, addOnboardingRequest } from "../lib/transactionsDb";
import { copyToClipboard } from "../lib/clipboardUtils";
import { cn } from "../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useAlert } from "~/contexts/AlertProvider";
import logger from "~/lib/log";
import { HomeStackParamList } from "~/Navigators";
import { BoardResult } from "react-native-nitro-ark";

const log = logger("BoardArkScreen");

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

// Custom hook for parsing boarding results
const useParsedBoardingResult = (
  boardResult?: BoardResult,
  boardAllResult?: BoardResult,
  offboardResult?: string,
) => {
  const [parsedData, setParsedData] = useState<BoardingResponse | null>(null);

  useEffect(() => {
    const result = boardResult || boardAllResult || offboardResult;
    if (result) {
      if (parsedData) {
        setParsedData(parsedData);
      }
    }
  }, [boardResult, boardAllResult, offboardResult]);

  return { parsedData, setParsedData };
};

// Balance display component
const BalanceDisplay = ({
  title,
  amount,
  pendingAmount,
  isLoading,
}: {
  title: string;
  amount: number;
  pendingAmount?: number;
  isLoading: boolean;
}) => (
  <View className="mb-8">
    <Text className="text-lg text-muted-foreground">{title}</Text>
    {isLoading ? (
      <NoahActivityIndicator className="mt-2" />
    ) : (
      <>
        <Text className="text-3xl font-bold text-foreground mt-1">
          {amount.toLocaleString()} sats
        </Text>
        {pendingAmount !== undefined && pendingAmount > 0 && (
          <Text className="text-xl text-muted-foreground mt-1">
            {pendingAmount.toLocaleString()} sats pending
          </Text>
        )}
      </>
    )}
  </View>
);

// Flow toggle component
const FlowToggle = ({ flow, onFlowChange }: { flow: Flow; onFlowChange: (flow: Flow) => void }) => (
  <View className="flex flex-row justify-around rounded-lg bg-muted p-1 mb-8">
    <Pressable
      onPress={() => onFlowChange("onboard")}
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
      onPress={() => onFlowChange("offboard")}
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
);

// Onboard input form component
const OnboardForm = ({
  amount,
  setAmount,
  onchainBalance,
  setIsMaxAmount,
}: {
  amount: string;
  setAmount: (amount: string) => void;
  onchainBalance: number;
  setIsMaxAmount: (isMax: boolean) => void;
}) => (
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
);

// Transaction result component
const TransactionResult = ({
  parsedData,
  flow,
  onCopyTxid,
}: {
  parsedData: BoardingResponse;
  flow: Flow;
  onCopyTxid: (txid: string) => void;
}) => (
  <View className="mt-8 space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-green-500">
          {flow === "onboard" ? "Boarding" : "Offboarding"} Transaction Sent!
        </CardTitle>
        <CardDescription>Funding TXID</CardDescription>
      </CardHeader>
      <CardContent>
        <Pressable onPress={() => onCopyTxid(parsedData.funding_txid)}>
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
  </View>
);

// Offboarding request result component
const OffboardingRequestResult = ({
  requestId,
  onCopyRequestId,
}: {
  requestId: string;
  onCopyRequestId: (id: string) => void;
}) => (
  <View className="mt-8 space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-green-500">Offboarding Request Registered!</CardTitle>
        <CardDescription>Request ID</CardDescription>
      </CardHeader>
      <CardContent>
        <Pressable onPress={() => onCopyRequestId(requestId)}>
          <Text
            className="text-base text-primary break-words"
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {requestId}
          </Text>
        </Pressable>
        <Text className="text-sm text-muted-foreground mt-2">
          Your request will be processed when the next Ark round starts.
        </Text>
      </CardContent>
    </Card>
  </View>
);

// Error display component
const ErrorDisplay = ({ errorMessage }: { errorMessage: string }) => (
  <Card className="mt-8 bg-destructive">
    <CardHeader>
      <CardTitle className="text-destructive-foreground">Error</CardTitle>
    </CardHeader>
    <CardContent>
      <Text className="text-base text-center text-destructive-foreground">{errorMessage}</Text>
    </CardContent>
  </Card>
);

const BoardArkScreen = () => {
  const { showAlert } = useAlert();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
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

  const [flow, setFlow] = useState<Flow>("onboard");
  const offboardResult = undefined; // Placeholder for offboard result
  const [amount, setAmount] = useState("");
  const [isMaxAmount, setIsMaxAmount] = useState(false);
  const [address, setAddress] = useState("");
  const [isRegisteringOffboard, setIsRegisteringOffboard] = useState(false);
  const [offboardingRequestId, setOffboardingRequestId] = useState<string | null>(null);

  // Use custom hook for parsing results
  const { parsedData, setParsedData } = useParsedBoardingResult(
    boardResult,
    boardAllResult,
    offboardResult,
  );

  // Store onboarding request in database when successful
  useEffect(() => {
    const storeOnboardingRequest = async () => {
      if (parsedData && flow === "onboard") {
        const onboardingRequestId = uuid.v4();

        const addResult = await addOnboardingRequest({
          request_id: onboardingRequestId,
          date: new Date().toISOString(),
          status: "completed",
          onchain_txid: parsedData.funding_txid,
        });

        if (addResult.isErr()) {
          log.e("Failed to store onboarding request in database", [addResult.error]);
        } else {
          log.d("Successfully stored onboarding request", [onboardingRequestId]);
        }
      }
    };

    storeOnboardingRequest();
  }, [parsedData, flow]);

  const onchainBalance = balance?.onchain.confirmed ?? 0;
  const onchainPendingBalance =
    (balance?.onchain.immature ?? 0) +
    (balance?.onchain.trusted_pending ?? 0) +
    (balance?.onchain.untrusted_pending ?? 0);

  const offchainBalance = balance?.offchain.spendable ?? 0;
  const offchainPendingBalance =
    (balance?.offchain.pending_lightning_send ?? 0) +
    (balance?.offchain.pending_in_round ?? 0) +
    (balance?.offchain.pending_exit ?? 0);

  const handlePress = async () => {
    Keyboard.dismiss();
    if (flow === "onboard") {
      handleBoard();
    } else {
      await handleOffboard();
    }
  };

  const handleOffboard = async () => {
    const btcValidation = validateBitcoinAddress(address);

    if (!address || !btcValidation.valid) {
      showAlert({
        title: "Invalid Address",
        description: "Please enter a valid Bitcoin address.",
      });
      return;
    }

    if (btcValidation.network !== APP_VARIANT) {
      showAlert({
        title: "Network Mismatch",
        description: `Please enter a ${APP_VARIANT} address. Detected ${btcValidation.network} address.`,
      });
      return;
    }

    setIsRegisteringOffboard(true);

    // Sign the address to prevent tampering
    const signatureResult = await signMessage(address, 0);
    if (signatureResult.isErr()) {
      setIsRegisteringOffboard(false);
      showAlert({
        title: "Signature Error",
        description: "Failed to sign address. Please try again.",
      });
      return;
    }

    const result = await registerOffboardingRequest({
      address,
      address_signature: signatureResult.value,
    });
    setIsRegisteringOffboard(false);
    if (result.isErr()) {
      showAlert({
        title: "Error",
        description: "Failed to register offboarding request.",
      });
      return;
    }

    const { request_id } = result.value;

    // Store in local database
    const dbResult = await addOffboardingRequest({
      request_id,
      date: new Date().toISOString(),
      status: "pending",
    });

    if (dbResult.isErr()) {
      log.e("Failed to store offboarding request in local database", [dbResult.error]);
    }

    setOffboardingRequestId(request_id);
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

  const handleCopyToClipboard = async (value: string) => {
    await copyToClipboard(value, {
      onCopy: () => {
        showAlert({ title: "Copied!", description: "TXID copied to clipboard." });
      },
    });
  };

  const errorMessage =
    (boardError instanceof Error ? boardError.message : String(boardError ?? "")) ||
    (boardAllError instanceof Error ? boardAllError.message : String(boardAllError ?? ""));

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            className="p-4"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between mb-8">
              <View className="flex-row items-center">
                <Pressable onPress={() => navigation.goBack()} className="mr-4">
                  <Icon name="arrow-back-outline" size={24} color="white" />
                </Pressable>
                <Text className="text-2xl font-bold text-foreground">
                  {flow === "onboard" ? "Board Ark" : "Offboard Ark"}
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate("BoardingTransactions")}
                className="p-2"
              >
                <Icon name="time-outline" size={24} color="white" />
              </Pressable>
            </View>

            {/* Flow Toggle */}
            <FlowToggle flow={flow} onFlowChange={setFlow} />

            {/* Description and Form */}
            {flow === "onboard" ? (
              <>
                <Text className="text-muted-foreground text-center mb-8">
                  Swap you onchain bitcoin and enter the Ark network for fast, cheap offchain
                  transactions.
                </Text>
                <BalanceDisplay
                  title="Confirmed On-chain Balance"
                  amount={onchainBalance}
                  pendingAmount={onchainPendingBalance}
                  isLoading={isBalanceLoading}
                />
                <OnboardForm
                  amount={amount}
                  setAmount={setAmount}
                  onchainBalance={onchainBalance}
                  setIsMaxAmount={setIsMaxAmount}
                />
              </>
            ) : (
              <>
                <Text className="text-muted-foreground text-center mb-8">
                  Register your offboarding request to exit Ark to on-chain Bitcoin. It will be
                  processed automatically when the next Ark round starts.
                </Text>
                <BalanceDisplay
                  title="Confirmed Off-chain Balance"
                  amount={offchainBalance}
                  pendingAmount={offchainPendingBalance}
                  isLoading={isBalanceLoading}
                />
                <View className="mb-4">
                  <Text className="text-lg text-red-400 mb-2">
                    Important: Please only input an external address like your cold storage wallet,
                    DO NOT use Noah wallet address, if you do, you will be boarding into Ark again.
                  </Text>

                  <Input
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Enter Bitcoin address"
                    className="border-border bg-card p-4 rounded-lg text-foreground"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </>
            )}

            {/* Action Button */}
            <NoahButton
              onPress={handlePress}
              isLoading={isBoarding || isBoardingAll || isRegisteringOffboard}
              disabled={
                isBoarding ||
                isBoardingAll ||
                isRegisteringOffboard ||
                (flow === "onboard" && (!amount || onchainBalance === 0)) ||
                (flow === "offboard" && (offchainBalance === 0 || !address))
              }
              className="mt-8"
            >
              {flow === "onboard" ? "Board Ark" : "Register Offboard Request"}
            </NoahButton>

            {/* Transaction Result */}
            {parsedData && (
              <TransactionResult
                parsedData={parsedData}
                flow={flow}
                onCopyTxid={handleCopyToClipboard}
              />
            )}

            {/* Offboarding Request Result */}
            {offboardingRequestId && (
              <OffboardingRequestResult
                requestId={offboardingRequestId}
                onCopyRequestId={handleCopyToClipboard}
              />
            )}

            {/* Error Display */}
            {(boardError || boardAllError) && <ErrorDisplay errorMessage={errorMessage} />}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </NoahSafeAreaView>
  );
};

export default BoardArkScreen;
