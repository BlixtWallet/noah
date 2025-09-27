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
} from "../hooks/usePayments";
import { useCopyToClipboard } from "../lib/clipboardUtils";
import QRCode from "react-native-qrcode-svg";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { satsToBtc, formatNumber } from "~/lib/utils";
import { useReceiveScreen } from "../hooks/useReceiveScreen";
import { COLORS } from "~/lib/styleConstants";
import { CurrencyToggle } from "~/components/CurrencyToggle";

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
          <Icon name="copy-outline" size={16} color="white" />
        )}
      </View>
    </Pressable>
  );
};

const ReceiveScreen = () => {
  const router = useRouter();
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

  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;

  useEffect(() => {
    let uri = "";

    if (onchainAddress && vtxoPubkey && lightningInvoice) {
      uri = `bitcoin:${onchainAddress.toUpperCase()}`;
      const params = [];

      if (vtxoPubkey) {
        params.push(`ark=${vtxoPubkey.toUpperCase()}`);
      }
      if (lightningInvoice) {
        params.push(`lightning=${lightningInvoice.toUpperCase()}`);
      }
      if (amountSat >= 330) {
        const amountInBtc = satsToBtc(amountSat);
        params.push(`amount=${amountInBtc}`);
      }

      if (params.length > 0) {
        uri += `?${params.join("&")}`;
      }

      setBip321Uri(uri);
    }
  }, [onchainAddress, vtxoPubkey, lightningInvoice, amountSat]);

  const handleGenerate = () => {
    Keyboard.dismiss();

    if (amountSat && amountSat < 330) {
      showAlert({
        title: "Invalid Amount",
        description: "The minimum amount is 330 sats.",
      });
      return;
    }

    generateOnchainAddress();
    generateOffchainAddress();
    if (amountSat >= 330) {
      generateLightningInvoice(amountSat);
    } else {
      generateLightningInvoice(0);
    }
  };

  const handleClear = () => {
    setBip321Uri(undefined);
    setAmount("");
    // Reset all mutations to clear their data
    resetOffchainAddress();
    resetOnchainAddress();
    resetLightningInvoice();
  };

  const handleCopyToClipboard = (value: string, type: string) => {
    copyWithState(value, type);
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background p-4">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 p-4">
          <View className="flex-row items-center mb-8">
            <Pressable onPress={() => router.back()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">Receive</Text>
          </View>

          <View className="flex-row items-center justify-center my-2">
            {currency === "USD" && <Text className="text-white text-3xl font-bold mr-2">$</Text>}
            <TextInput
              className="text-white text-3xl font-bold text-center h-20"
              placeholder="0"
              placeholderTextColor="#6b7280"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
            {currency === "SATS" && (
              <Text className="text-white text-3xl font-bold ml-2">sats</Text>
            )}
            <View className="ml-2">
              <CurrencyToggle onPress={toggleCurrency} />
            </View>
          </View>
          <Text className="text-gray-400 text-center text-xl">
            {currency === "SATS"
              ? `$${
                  btcPrice && amountSat && !isNaN(amountSat)
                    ? formatNumber(((amountSat * btcPrice) / 100000000).toFixed(2))
                    : "0.00"
                }`
              : `${!isNaN(amountSat) && amount ? formatNumber(amountSat) : 0} sats`}
          </Text>

          <View className="flex-row items-center justify-between mt-6 gap-4">
            {bip321Uri ? (
              <View className="flex-1">
                <Button onPress={handleClear} variant="outline">
                  <Text>Clear</Text>
                </Button>
              </View>
            ) : null}
            <View className="flex-1">
              <NoahButton onPress={handleGenerate} isLoading={isLoading} disabled={isLoading}>
                Generate
              </NoahButton>
            </View>
          </View>

          {bip321Uri && (
            <ScrollView className="mt-8">
              <View className="p-4 bg-card rounded-lg items-center">
                <View className="p-2 bg-white rounded-lg">
                  <QRCode value={bip321Uri} size={200} backgroundColor="white" color="black" />
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

              <View>
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
                    value={lightningInvoice}
                    onCopy={() => handleCopyToClipboard(lightningInvoice, "lightning")}
                    isCopied={isCopied("lightning")}
                  />
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default ReceiveScreen;
