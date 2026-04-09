import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Animated, { FadeInDown, FadeInUp, ZoomIn } from "react-native-reanimated";
import { useIconColor, useThemeColors } from "../hooks/useTheme";
import { satsToBtc, formatNumber, formatBip177 } from "~/lib/utils";
import { useReceiveScreen } from "../hooks/useReceiveScreen";
import { COLORS } from "~/lib/styleConstants";
import { CurrencyToggle } from "~/components/CurrencyToggle";
import {
  history,
} from "~/lib/paymentsApi";
import { isArkReceiveMovement } from "~/lib/barkMovement";
import logger from "~/lib/log";
import type { Bolt11Invoice } from "react-native-nitro-ark";
import { queryClient } from "~/queryClient";
import { BlinkingCaret } from "~/components/BlinkingCaret";

const minAmount = 1;
const ARK_RECEIVE_POLL_INTERVAL_MS = 1500;
const log = logger("ReceiveScreen");

type ActiveReceiveSession = {
  sessionId: number;
  amountSat: number;
  paymentHash?: string;
  arkAddress?: string;
};

type ReceiveRailGeneration = {
  amountSat: number;
  arkAddress?: string;
  lightningInvoice?: Bolt11Invoice;
  onchainAddress?: string;
};

const truncateAddress = (addr: string) => {
  if (addr.length <= 40) {
    return addr;
  }
  return `${addr.slice(0, 15)}...${addr.slice(-15)}`;
};

const buildReceiveRequestUri = ({
  amountSat,
  arkAddress,
  lightningInvoice,
  onchainAddress,
}: Omit<ReceiveRailGeneration, "amountSat"> & { amountSat: number | null }) => {
  if (amountSat === null) {
    return undefined;
  }

  const params: string[] = [];

  if (amountSat >= minAmount) {
    params.push(`amount=${satsToBtc(amountSat)}`);
  }

  if (arkAddress) {
    params.push(`ark=${arkAddress.toUpperCase()}`);
  }

  if (lightningInvoice?.payment_request) {
    params.push(`lightning=${lightningInvoice.payment_request.toUpperCase()}`);
  }

  if (!onchainAddress && params.length === 0) {
    return undefined;
  }

  let uri = `bitcoin:${onchainAddress ?? ""}`;

  if (params.length > 0) {
    uri += `?${params.join("&")}`;
  }

  return uri;
};

const PaymentRail = ({
  icon,
  label,
  value,
  onCopy,
  isCopied,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
  onCopy: () => void;
  isCopied: boolean;
}) => {
  const iconColor = useIconColor();
  return (
    <Pressable
      onPress={onCopy}
      className="flex-row items-center gap-4 py-4"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full border border-border"
        style={{ backgroundColor: "rgba(201, 138, 60, 0.10)" }}
      >
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
        <Text
          className="mt-1 text-sm text-muted-foreground"
          ellipsizeMode="middle"
          numberOfLines={1}
        >
          {truncateAddress(value)}
        </Text>
      </View>
      <Text
        className="text-xs font-semibold uppercase tracking-[2px]"
        style={{ color: isCopied ? COLORS.SUCCESS : COLORS.BITCOIN_ORANGE }}
      >
        {isCopied ? "Copied" : "Copy"}
      </Text>
    </Pressable>
  );
};

const ReceiveScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<TabParamList>>();
  const iconColor = useIconColor();
  const colors = useThemeColors();
  const { amount, setAmount, currency, toggleCurrency, amountSat, btcPrice } = useReceiveScreen();
  const { copyWithState, isCopied } = useCopyToClipboard();
  const [generatedReceiveData, setGeneratedReceiveData] = useState<ReceiveRailGeneration | null>(
    null,
  );
  const { showAlert } = useAlert();
  const receiveSessionIdRef = useRef(0);
  const activeReceiveSessionRef = useRef<ActiveReceiveSession | null>(null);
  const isCompletingReceiveRef = useRef(false);
  const amountInputRef = useRef<TextInput>(null);

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

  const bip321Uri = useMemo(
    () =>
      buildReceiveRequestUri({
        amountSat: generatedReceiveData?.amountSat ?? null,
        arkAddress: generatedReceiveData?.arkAddress,
        lightningInvoice: generatedReceiveData?.lightningInvoice,
        onchainAddress: generatedReceiveData?.onchainAddress,
      }),
    [generatedReceiveData],
  );
  const arkAddress = generatedReceiveData?.arkAddress;
  const lightningInvoice = generatedReceiveData?.lightningInvoice;
  const generatedOnchainAddress = generatedReceiveData?.onchainAddress;
  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;
  const isGenerated = Boolean(bip321Uri);
  const isAmountLocked = isLoading || isGenerated;
  const displayAmount = amount === "" ? (currency === "USD" ? "0.00" : "0") : amount;
  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const clearGeneratedReceiveData = useCallback(
    ({ resetAmount }: { resetAmount: boolean }) => {
      startTransition(() => {
        setGeneratedReceiveData(null);
        if (resetAmount) {
          setAmount("");
        }
      });
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
      resetLnReceiveCheck();
      clearGeneratedReceiveData({ resetAmount });
    },
    [clearGeneratedReceiveData, resetLnReceiveCheck],
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

  const checkArkReceiveHistory = useCallback(
    async (sessionId: number, address: string) => {
      const activeSession = activeReceiveSessionRef.current;
      if (!activeSession || activeSession.sessionId !== sessionId) {
        return false;
      }

      const movementsResult = await history();
      if (movementsResult.isErr()) {
        log.w("Failed to poll Ark receive history", [movementsResult.error.message]);
        return false;
      }

      const matchingMovement = movementsResult.value.find((movement) => {
        if (movement.status !== "successful" || !isArkReceiveMovement(movement)) {
          return false;
        }

        return (
          movement.received_on?.some((destination) => destination.destination === address) ?? false
        );
      });

      if (!matchingMovement) {
        return false;
      }

      const matchingReceivedOn =
        matchingMovement.received_on?.filter((destination) => destination.destination === address) ??
        [];

      const receivedAmountSat = matchingReceivedOn.reduce(
        (sum, destination) => sum + destination.amount_sat,
        0,
      );

      handleReceiveComplete(receivedAmountSat > 0 ? receivedAmountSat : activeSession.amountSat);
      return true;
    },
    [handleReceiveComplete],
  );

  useEffect(() => {
    if (!lightningInvoice?.payment_hash) {
      return;
    }

    const activeSession = activeReceiveSessionRef.current;
    if (!activeSession || activeSession.paymentHash === lightningInvoice.payment_hash) {
      return;
    }

    activeSession.paymentHash = lightningInvoice.payment_hash;
    const sessionId = activeSession.sessionId;

    void checkAndClaimLnReceive({
      paymentHash: lightningInvoice.payment_hash,
      amountSat: activeSession.amountSat,
      sessionId,
      shouldCancel: () => activeReceiveSessionRef.current?.sessionId !== sessionId,
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
    if (!activeSession) {
      return;
    }

    activeSession.arkAddress = arkAddress;
    let cancelled = false;
    const sessionId = activeSession.sessionId;

    const poll = async () => {
      while (!cancelled) {
        if (activeReceiveSessionRef.current?.sessionId !== sessionId) {
          return;
        }

        const didReceive = await checkArkReceiveHistory(sessionId, arkAddress);
        if (didReceive || cancelled) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, ARK_RECEIVE_POLL_INTERVAL_MS));
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [arkAddress, checkArkReceiveHistory]);

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
    activeReceiveSessionRef.current = {
      sessionId: receiveSessionIdRef.current,
      amountSat,
    };

    const sessionId = receiveSessionIdRef.current;

    void Promise.allSettled([
      generateOnchainAddress(),
      generateOffchainAddress(),
      generateLightningInvoice(amountSat),
    ])
      .then(([nextOnchainAddressResult, nextArkAddressResult, nextLightningInvoiceResult]) => {
        if (activeReceiveSessionRef.current?.sessionId !== sessionId) {
          return;
        }

        if (nextOnchainAddressResult.status === "rejected") {
          log.w("Receive rail generation failed", ["onchain", nextOnchainAddressResult.reason]);
        }

        if (nextArkAddressResult.status === "rejected") {
          log.w("Receive rail generation failed", ["ark", nextArkAddressResult.reason]);
        }

        if (nextLightningInvoiceResult.status === "rejected") {
          log.w("Receive rail generation failed", [
            "lightning",
            nextLightningInvoiceResult.reason,
          ]);
        }

        const nextOnchainAddress =
          nextOnchainAddressResult.status === "fulfilled"
            ? nextOnchainAddressResult.value
            : undefined;
        const nextArkAddress =
          nextArkAddressResult.status === "fulfilled" ? nextArkAddressResult.value : undefined;
        const nextLightningInvoice =
          nextLightningInvoiceResult.status === "fulfilled"
            ? nextLightningInvoiceResult.value
            : undefined;

        if (!nextOnchainAddress && !nextArkAddress && !nextLightningInvoice) {
          cancelReceiveSession({ resetAmount: false });
          return;
        }

        startTransition(() => {
          setGeneratedReceiveData({
            amountSat,
            onchainAddress: nextOnchainAddress,
            arkAddress: nextArkAddress,
            lightningInvoice: nextLightningInvoice,
          });
        });
      });
  };

  const handleClear = () => {
    cancelReceiveSession({ resetAmount: true });
  };

  const handleCopyToClipboard = (value: string, type: string) => {
    copyWithState(value, type);
  };

  const focusAmountInput = useCallback(() => {
    if (isAmountLocked) {
      return;
    }

    requestAnimationFrame(() => {
      amountInputRef.current?.focus();
    });
  }, [isAmountLocked]);

  useEffect(() => {
    if (!isAmountLocked) {
      return;
    }

    amountInputRef.current?.blur();
    setIsAmountFocused(false);
  }, [isAmountLocked]);

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <View className="px-5 pb-8">
            <View className="mb-4 flex-row items-center pt-1">
              <Pressable onPress={() => navigation.goBack()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color={iconColor} />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">Receive</Text>
            </View>

            <Animated.View entering={FadeInUp.duration(520)} className="pt-1">
              <Text className="text-[11px] font-semibold uppercase tracking-[3px] text-muted-foreground">
                Receive Bitcoin
              </Text>
              <Text className="mt-2 max-w-[320px] text-base leading-6 text-muted-foreground">
                Generate a payment request with Ark, Lightning, and on-chain rails when available.
              </Text>
            </Animated.View>

            <Animated.View className="mt-4">
              <View className="flex-row items-start justify-end gap-4">
                <View className="flex-1">
                  {isGenerated ? (
                    <Text className="text-sm text-muted-foreground">
                      Listening for payment until you clear or leave this screen.
                    </Text>
                  ) : null}
                </View>
                <CurrencyToggle onPress={toggleCurrency} disabled={isAmountLocked} />
              </View>

              <View className="mt-4 items-center">
                <View className="mt-2 h-[64px] justify-center">
                  <View className="self-center">
                    <Pressable onPress={focusAmountInput} disabled={isAmountLocked}>
                      <View className="flex-row items-center justify-center">
                        <Text className="mr-3 text-[46px] font-bold leading-[52px] text-foreground">
                          {currency === "USD" ? "$" : "₿"}
                        </Text>
                        <Text className="text-[46px] font-bold leading-[52px] text-foreground">
                          {displayAmount}
                        </Text>
                        <BlinkingCaret
                          color={COLORS.BITCOIN_ORANGE}
                          height={40}
                          visible={isAmountFocused && !isAmountLocked}
                        />
                      </View>
                    </Pressable>
                  </View>

                  <TextInput
                    ref={amountInputRef}
                    placeholder=""
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus={false}
                    editable={!isAmountLocked}
                    onFocus={() => setIsAmountFocused(true)}
                    onBlur={() => setIsAmountFocused(false)}
                    maxLength={12}
                    selectionColor={COLORS.BITCOIN_ORANGE}
                    style={{
                      position: "absolute",
                      opacity: 0,
                      width: 1,
                      height: 1,
                    }}
                  />
                </View>

                <Text className="mt-3 text-lg font-medium text-muted-foreground">
                  {currency === "SATS"
                    ? `≈ $${
                        btcPrice && amountSat && !isNaN(amountSat)
                          ? formatNumber(((amountSat * btcPrice) / 100000000).toFixed(2))
                          : "0.00"
                      }`
                    : `≈ ${!isNaN(amountSat) && amount ? formatBip177(amountSat) : formatBip177(0)}`}
                </Text>

                <View
                  className="mt-4 rounded-full border px-4 py-2"
                  style={{
                    borderColor: `${colors.mutedForeground}1F`,
                  }}
                >
                  <Text className="text-sm text-muted-foreground">
                    {isGenerated
                      ? "Payment request is live"
                      : `Minimum receive amount: ${formatBip177(minAmount)}`}
                  </Text>
                </View>
              </View>

              {bip321Uri ? (
                <Animated.View entering={ZoomIn.duration(420)} className="mt-7 items-center">
                  <View className="items-center justify-center px-2 py-2">
                    <View className="rounded-[24px] bg-white p-4 shadow-sm shadow-foreground/5">
                      <QRCode value={bip321Uri} size={190} backgroundColor="white" color="black" />
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleCopyToClipboard(bip321Uri, "bip321")}
                    className="mt-5"
                  >
                    <Text className="text-sm font-semibold text-primary">
                      {isCopied("bip321") ? "Request copied" : "Tap to copy request"}
                    </Text>
                  </Pressable>
                  <Text className="mt-3 max-w-[270px] text-center text-sm leading-6 text-muted-foreground">
                    This QR includes every receive rail that generated successfully.
                  </Text>
                </Animated.View>
              ) : null}
            </Animated.View>

            {isGenerated && (
              <Animated.View
                entering={FadeInDown.duration(520).delay(80)}
                className="mt-6 overflow-hidden border-t px-1"
                style={{
                  borderColor: `${colors.mutedForeground}22`,
                }}
              >
                <View className="flex-row items-center justify-between pt-5">
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-muted-foreground">
                    Available via
                  </Text>
                  <Text className="text-xs font-medium uppercase tracking-[2px] text-muted-foreground">
                    Tap any rail
                  </Text>
                </View>

                {arkAddress && (
                  <>
                    <PaymentRail
                      icon="boat-outline"
                      label="Ark"
                      value={arkAddress}
                      onCopy={() => handleCopyToClipboard(arkAddress, "ark")}
                      isCopied={isCopied("ark")}
                    />
                    <View className="h-px bg-border" />
                  </>
                )}

                {lightningInvoice && (
                  <>
                    <PaymentRail
                      icon="flash-outline"
                      label="Lightning"
                      value={lightningInvoice.payment_request}
                      onCopy={() =>
                        handleCopyToClipboard(lightningInvoice.payment_request, "lightning")
                      }
                      isCopied={isCopied("lightning")}
                    />
                    <View className="h-px bg-border" />
                  </>
                )}

                {generatedOnchainAddress && (
                  <PaymentRail
                    icon="link-outline"
                    label="On-chain"
                    value={generatedOnchainAddress}
                    onCopy={() => handleCopyToClipboard(generatedOnchainAddress, "onchain")}
                    isCopied={isCopied("onchain")}
                  />
                )}
              </Animated.View>
            )}

            <Animated.View className="mt-5 flex-row items-center gap-3">
              <Button
                onPress={handleClear}
                variant="outline"
                disabled={!isGenerated && amount === ""}
                className="h-14 w-[144px] rounded-2xl"
              >
                <Text className="font-semibold">Clear</Text>
              </Button>
              <NoahButton
                onPress={handleGenerate}
                isLoading={isLoading}
                disabled={isLoading || amount === "" || amountSat < minAmount}
                className="h-14 min-w-0 flex-1 rounded-2xl"
              >
                {isGenerated ? "New request" : "Generate request"}
              </NoahButton>
            </Animated.View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default ReceiveScreen;
