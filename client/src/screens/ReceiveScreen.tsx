import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
  TextInput,
  ScrollView,
} from "react-native";
import { Text } from "../components/ui/text";
import { useAlert } from "~/contexts/AlertProvider";
import { NoahButton } from "../components/ui/NoahButton";
import { Button } from "~/components/ui/button";

import {
  useGenerateLightningInvoice,
  useGenerateOnchainAddress,
  useGenerateOffchainAddress,
  useCheckAndClaimLnReceive,
} from "../hooks/usePayments";
import { useCopyToClipboard } from "../lib/clipboardUtils";
import QRCode from "react-native-qrcode-svg";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { TabParamList } from "~/Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { useIconColor, useThemeColors } from "../hooks/useTheme";
import { satsToBtc, formatNumber, formatBip177 } from "~/lib/utils";
import { useReceiveScreen } from "../hooks/useReceiveScreen";
import { COLORS } from "~/lib/styleConstants";
import { CurrencyToggle } from "~/components/CurrencyToggle";
import {
  subscribeArkoorAddressMovements,
  type BarkNotificationEvent,
  type BarkNotificationSubscription,
} from "~/lib/paymentsApi";
import { isArkReceiveMovement } from "~/lib/barkMovement";
import logger from "~/lib/log";
import type { Bolt11Invoice } from "react-native-nitro-ark";
import { queryClient } from "~/queryClient";

const minAmount = 1;
const log = logger("ReceiveScreen");

type ActiveReceiveSession = {
  sessionId: number;
  amountSat: number;
  paymentHash?: string;
  arkAddress?: string;
};

const truncateAddress = (addr: string) => {
  if (addr.length <= 40) {
    return addr;
  }
  return `${addr.slice(0, 15)}...${addr.slice(-15)}`;
};

const CopyableDetail = ({
  label,
  value,
  onCopy,
  isCopied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  isCopied: boolean;
}) => {
  const iconColor = useIconColor();
  return (
    <Pressable
      onPress={onCopy}
      className="flex-row items-center justify-between p-3 bg-card rounded-lg mb-2"
    >
      <Text className="text-muted-foreground text-sm">{label}:</Text>
      <View className="flex-row items-center gap-x-2 flex-1 justify-end">
        <Text
          className="text-foreground text-sm text-right"
          ellipsizeMode="middle"
          numberOfLines={1}
        >
          {truncateAddress(value)}
        </Text>
        {isCopied ? (
          <Icon name="checkmark-circle-outline" size={16} color={COLORS.SUCCESS} />
        ) : (
          <Icon name="copy-outline" size={16} color={iconColor} />
        )}
      </View>
    </Pressable>
  );
};

const ReceiveScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<TabParamList>>();
  const iconColor = useIconColor();
  const colors = useThemeColors();
  const { amount, setAmount, currency, toggleCurrency, amountSat, btcPrice } = useReceiveScreen();
  const { copyWithState, isCopied } = useCopyToClipboard();
  const [bip321Uri, setBip321Uri] = useState<string | undefined>(undefined);
  const [generatedAmountSat, setGeneratedAmountSat] = useState<number | null>(null);
  const [arkAddress, setArkAddress] = useState<string | undefined>(undefined);
  const [generatedOnchainAddress, setGeneratedOnchainAddress] = useState<string | undefined>(
    undefined,
  );
  const [lightningInvoice, setLightningInvoice] = useState<Bolt11Invoice | undefined>(undefined);
  const { showAlert } = useAlert();
  const receiveSessionIdRef = useRef(0);
  const activeReceiveSessionRef = useRef<ActiveReceiveSession | null>(null);
  const arkSubscriptionRef = useRef<BarkNotificationSubscription | null>(null);
  const isCompletingReceiveRef = useRef(false);

  const {
    mutateAsync: generateOffchainAddress,
    isPending: isGeneratingVtxo,
    reset: resetOffchainAddress,
  } = useGenerateOffchainAddress();

  const {
    mutateAsync: generateOnchainAddress,
    isPending: isGeneratingOnchain,
    reset: resetOnchainAddress,
  } = useGenerateOnchainAddress();

  const {
    mutateAsync: generateLightningInvoice,
    isPending: isGeneratingLightning,
    reset: resetLightningInvoice,
  } = useGenerateLightningInvoice();

  const {
    mutateAsync: checkAndClaimLnReceive,
    reset: resetLnReceiveCheck,
  } = useCheckAndClaimLnReceive();

  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;

  const stopArkSubscription = useCallback(() => {
    const subscription = arkSubscriptionRef.current;

    if (!subscription) {
      return;
    }

    arkSubscriptionRef.current = null;

    try {
      if (subscription.isActive()) {
        subscription.stop();
      }
    } catch (error) {
      log.w("Failed to stop Ark receive subscription", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }, []);

  const clearGeneratedReceiveData = useCallback(
    ({ resetAmount }: { resetAmount: boolean }) => {
      setBip321Uri(undefined);
      setGeneratedAmountSat(null);
      setArkAddress(undefined);
      setGeneratedOnchainAddress(undefined);
      setLightningInvoice(undefined);
      if (resetAmount) {
        setAmount("");
      }
      resetOffchainAddress();
      resetOnchainAddress();
      resetLightningInvoice();
    },
    [resetLightningInvoice, resetOffchainAddress, resetOnchainAddress, setAmount],
  );

  const cancelReceiveSession = useCallback(
    ({ resetAmount }: { resetAmount: boolean }) => {
      receiveSessionIdRef.current += 1;
      activeReceiveSessionRef.current = null;
      isCompletingReceiveRef.current = false;
      stopArkSubscription();
      resetLnReceiveCheck();
      clearGeneratedReceiveData({ resetAmount });
    },
    [clearGeneratedReceiveData, resetLnReceiveCheck, stopArkSubscription],
  );

  const handleReceiveComplete = useCallback(
    (receivedAmountSat: number) => {
      if (!activeReceiveSessionRef.current || isCompletingReceiveRef.current) {
        return;
      }

      isCompletingReceiveRef.current = true;
      cancelReceiveSession({ resetAmount: true });
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });

      navigation.navigate("Home", {
        screen: "ReceiveSuccess",
        params: { amountSat: receivedAmountSat },
      });
    },
    [cancelReceiveSession, navigation],
  );

  const handleArkoorReceiveEvent = useCallback(
    (event: BarkNotificationEvent, sessionId: number) => {
      if (event.kind === "channelLagging") {
        return;
      }

      const activeSession = activeReceiveSessionRef.current;
      if (!activeSession || activeSession.sessionId !== sessionId) {
        return;
      }

      const movement = event.movement;
      if (!movement || movement.status !== "successful" || !isArkReceiveMovement(movement)) {
        return;
      }

      const matchingReceivedOn =
        movement.received_on?.filter(
          (destination) => destination.destination === activeSession.arkAddress,
        ) ?? [];

      if (matchingReceivedOn.length === 0) {
        return;
      }

      const receivedAmountSat = matchingReceivedOn.reduce(
        (sum, destination) => sum + destination.amount_sat,
        0,
      );

      handleReceiveComplete(receivedAmountSat > 0 ? receivedAmountSat : activeSession.amountSat);
    },
    [handleReceiveComplete],
  );

  useEffect(() => {
    let uri = "";

    if (arkAddress && lightningInvoice?.payment_request && generatedAmountSat !== null) {
      // Use empty path for unified QR codes with multiple payment methods
      uri = `bitcoin:`;
      const params = [];

      // Amount should come first per BIP-321 convention
      if (generatedAmountSat >= minAmount) {
        const amountInBtc = satsToBtc(generatedAmountSat);
        params.push(`amount=${amountInBtc}`);
      }

      // Add payment methods - use uppercase for QR code efficiency
      if (arkAddress) {
        params.push(`ark=${arkAddress.toUpperCase()}`);
      }
      if (lightningInvoice?.payment_request) {
        params.push(`lightning=${lightningInvoice.payment_request.toUpperCase()}`);
      }

      if (params.length > 0) {
        uri += `?${params.join("&")}`;
      }

      setBip321Uri(uri);
    }
  }, [arkAddress, generatedAmountSat, lightningInvoice]);

  useEffect(() => {
    if (!lightningInvoice?.payment_hash) {
      return;
    }

    const activeSession = activeReceiveSessionRef.current;
    if (!activeSession || activeSession.paymentHash === lightningInvoice.payment_hash) {
      return;
    }

    activeSession.paymentHash = lightningInvoice.payment_hash;

    void checkAndClaimLnReceive({
      paymentHash: lightningInvoice.payment_hash,
      amountSat: activeSession.amountSat,
      sessionId: activeSession.sessionId,
    })
      .then((receiveData) => {
        if (activeReceiveSessionRef.current?.sessionId !== receiveData.sessionId) {
          return;
        }

        handleReceiveComplete(receiveData.amountSat);
      })
      .catch(() => {
        // The mutation already logs failures; stale sessions are ignored here.
      });
  }, [checkAndClaimLnReceive, handleReceiveComplete, lightningInvoice?.payment_hash]);

  useEffect(() => {
    if (!arkAddress) {
      return;
    }

    const activeSession = activeReceiveSessionRef.current;
    if (!activeSession || activeSession.arkAddress === arkAddress) {
      return;
    }

    activeSession.arkAddress = arkAddress;
    stopArkSubscription();

    const subscriptionResult = subscribeArkoorAddressMovements(arkAddress, (event) => {
      handleArkoorReceiveEvent(event, activeSession.sessionId);
    });

    if (subscriptionResult.isErr()) {
      log.w("Failed to subscribe to Ark receive updates", [subscriptionResult.error.message]);
      return;
    }

    arkSubscriptionRef.current = subscriptionResult.value;
  }, [arkAddress, handleArkoorReceiveEvent, stopArkSubscription]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        cancelReceiveSession({ resetAmount: false });
      };
    }, [cancelReceiveSession]),
  );

  const handleGenerate = () => {
    Keyboard.dismiss();

    if (!amountSat) {
      showAlert({
        title: "Invalid Amount",
        description: "Please enter an amount.",
      });
      return;
    }

    if (amountSat < minAmount) {
      showAlert({
        title: "Invalid Amount",
        description: `The minimum amount is ${minAmount} sats.`,
      });
      return;
    }

    cancelReceiveSession({ resetAmount: false });
    setGeneratedAmountSat(amountSat);
    activeReceiveSessionRef.current = {
      sessionId: receiveSessionIdRef.current,
      amountSat,
    };

    const sessionId = receiveSessionIdRef.current;

    void Promise.all([
      generateOnchainAddress(),
      generateOffchainAddress(),
      generateLightningInvoice(amountSat),
    ])
      .then(([nextOnchainAddress, nextArkAddress, nextLightningInvoice]) => {
        if (activeReceiveSessionRef.current?.sessionId !== sessionId) {
          return;
        }

        setGeneratedOnchainAddress(nextOnchainAddress);
        setArkAddress(nextArkAddress);
        setLightningInvoice(nextLightningInvoice);
      })
      .catch(() => {
        if (activeReceiveSessionRef.current?.sessionId !== sessionId) {
          return;
        }

        cancelReceiveSession({ resetAmount: false });
      });
  };

  const handleClear = () => {
    cancelReceiveSession({ resetAmount: true });
  };

  const handleCopyToClipboard = (value: string, type: string) => {
    copyWithState(value, type);
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 20 }}>
          <View className="p-4">
            <View className="flex-row items-center mb-4">
              <Pressable onPress={() => navigation.goBack()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color={iconColor} />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">Receive</Text>
            </View>

            <View className="flex-row items-center justify-between mb-4 px-2">
              <Text className="text-muted-foreground text-base font-medium">Amount to receive</Text>
              <CurrencyToggle onPress={toggleCurrency} />
            </View>

            <View className="mb-4">
              <View className="bg-card/50 rounded-xl border-2 border-border px-4 py-4 mb-3">
                <View className="flex-row items-center justify-center">
                  {currency === "USD" && (
                    <Text className="text-foreground text-2xl font-bold mr-2">$</Text>
                  )}
                  <TextInput
                    className="text-foreground text-3xl font-bold text-center min-w-[50px]"
                    placeholder={currency === "USD" ? "0.00" : "0"}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus={false}
                    maxLength={12}
                  />
                  {currency === "SATS" && (
                    <Text className="text-foreground text-2xl font-bold ml-1">₿</Text>
                  )}
                </View>
              </View>

              <View className="flex-row items-center justify-center px-2">
                <Text className="text-muted-foreground text-lg">
                  {currency === "SATS"
                    ? `≈ $${
                        btcPrice && amountSat && !isNaN(amountSat)
                          ? formatNumber(((amountSat * btcPrice) / 100000000).toFixed(2))
                          : "0.00"
                      }`
                    : `≈ ${!isNaN(amountSat) && amount ? formatBip177(amountSat) : formatBip177(0)}`}
                </Text>
              </View>
            </View>

            <View className="px-4 py-2 bg-card/50 rounded-lg mx-auto">
              <Text className="text-muted-foreground text-sm text-center">
                {`Minimum receive amount: ${formatBip177(minAmount)}`}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mt-4 gap-4">
              {bip321Uri ? (
                <View className="flex-1">
                  <Button onPress={handleClear} variant="outline">
                    <Text>Clear</Text>
                  </Button>
                </View>
              ) : null}
              <View className="flex-1">
                <NoahButton
                  onPress={handleGenerate}
                  isLoading={isLoading}
                  disabled={isLoading || amount === "" || amountSat < minAmount}
                >
                  Generate
                </NoahButton>
              </View>
            </View>

            {bip321Uri && (
              <View className="mt-4">
                <View className="p-3 bg-card rounded-lg items-center">
                  <View className="p-2 bg-white rounded-lg">
                    <QRCode value={bip321Uri} size={180} backgroundColor="white" color="black" />
                  </View>
                  <Pressable
                    onPress={() => handleCopyToClipboard(bip321Uri, "bip321")}
                    className="mt-4 p-2"
                  >
                    <Text className="text-sm text-center text-primary">
                      {isCopied("bip321") ? "Copied!" : "Tap to copy BIP321"}
                    </Text>
                  </Pressable>
                </View>

                <View className="mt-2">
                  {generatedOnchainAddress && (
                    <CopyableDetail
                      label="On-chain"
                      value={generatedOnchainAddress}
                      onCopy={() => handleCopyToClipboard(generatedOnchainAddress, "onchain")}
                      isCopied={isCopied("onchain")}
                    />
                  )}

                  {arkAddress && (
                    <CopyableDetail
                      label="Ark"
                      value={arkAddress}
                      onCopy={() => handleCopyToClipboard(arkAddress, "ark")}
                      isCopied={isCopied("ark")}
                    />
                  )}

                  {lightningInvoice && (
                    <CopyableDetail
                      label="Lightning"
                      value={lightningInvoice.payment_request}
                      onCopy={() =>
                        handleCopyToClipboard(lightningInvoice.payment_request, "lightning")
                      }
                      isCopied={isCopied("lightning")}
                    />
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default ReceiveScreen;
