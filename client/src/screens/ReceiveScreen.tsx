import React, { useEffect, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { TabParamList } from "~/Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { useIconColor } from "../hooks/useTheme";
import { satsToBtc, formatNumber, formatBip177 } from "~/lib/utils";
import { useReceiveScreen } from "../hooks/useReceiveScreen";
import { COLORS } from "~/lib/styleConstants";
import { CurrencyToggle } from "~/components/CurrencyToggle";

const minAmount = 330;

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
  const { amount, setAmount, currency, toggleCurrency, amountSat, btcPrice } = useReceiveScreen();
  const { copyWithState, isCopied } = useCopyToClipboard();
  const [bip321Uri, setBip321Uri] = useState<string | undefined>(undefined);
  const { showAlert } = useAlert();

  const {
    mutate: generateOffchainAddress,
    data: vtxoPubkey,
    isPending: isGeneratingVtxo,
    reset: resetOffchainAddress,
  } = useGenerateOffchainAddress();

  const {
    mutate: generateOnchainAddress,
    data: onchainAddress,
    isPending: isGeneratingOnchain,
    reset: resetOnchainAddress,
  } = useGenerateOnchainAddress();

  const {
    mutate: generateLightningInvoice,
    data: lightningInvoice,
    isPending: isGeneratingLightning,
    reset: resetLightningInvoice,
  } = useGenerateLightningInvoice();

  const {
    mutate: checkAndClaimLnReceive,
    isSuccess: isReceiveSuccess,
    data: receiveData,
  } = useCheckAndClaimLnReceive();

  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;

  useEffect(() => {
    let uri = "";

    if (vtxoPubkey && lightningInvoice?.payment_request) {
      // Use empty path for unified QR codes with multiple payment methods
      uri = `bitcoin:`;
      const params = [];

      // Amount should come first per BIP-321 convention
      if (amountSat >= minAmount) {
        const amountInBtc = satsToBtc(amountSat);
        params.push(`amount=${amountInBtc}`);
      }

      // Add payment methods - use uppercase for QR code efficiency
      if (vtxoPubkey) {
        params.push(`ark=${vtxoPubkey.toUpperCase()}`);
      }
      if (lightningInvoice?.payment_request) {
        params.push(`lightning=${lightningInvoice.payment_request.toUpperCase()}`);
      }

      if (params.length > 0) {
        uri += `?${params.join("&")}`;
      }

      setBip321Uri(uri);
    }
  }, [vtxoPubkey, lightningInvoice, amountSat]);

  useEffect(() => {
    if (lightningInvoice && amountSat) {
      checkAndClaimLnReceive({ paymentHash: lightningInvoice.payment_hash, amountSat });
    }
  }, [lightningInvoice, amountSat, checkAndClaimLnReceive]);

  useEffect(() => {
    if (isReceiveSuccess && receiveData) {
      handleClear();
      navigation.navigate("Home", {
        screen: "ReceiveSuccess",
        params: { amountSat: receiveData.amountSat },
      });
    }
  }, [isReceiveSuccess, receiveData, navigation]);

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

    generateOnchainAddress();
    generateOffchainAddress();
    generateLightningInvoice(amountSat);
  };

  const handleClear = () => {
    setBip321Uri(undefined);
    setAmount("");
    resetOffchainAddress();
    resetOnchainAddress();
    resetLightningInvoice();
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
                    <Text className="text-white text-2xl font-bold mr-2">$</Text>
                  )}
                  <TextInput
                    className="text-white text-3xl font-bold text-center min-w-[50px]"
                    placeholder={currency === "USD" ? "0.00" : "0"}
                    placeholderTextColor="#4b5563"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus={false}
                    maxLength={12}
                  />
                  {currency === "SATS" && (
                    <Text className="text-white text-2xl font-bold ml-1">₿</Text>
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
                  {onchainAddress && (
                    <CopyableDetail
                      label="On-chain"
                      value={onchainAddress}
                      onCopy={() => handleCopyToClipboard(onchainAddress, "onchain")}
                      isCopied={isCopied("onchain")}
                    />
                  )}

                  {vtxoPubkey && (
                    <CopyableDetail
                      label="Ark"
                      value={vtxoPubkey}
                      onCopy={() => handleCopyToClipboard(vtxoPubkey, "ark")}
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
