import React, { useEffect, useState } from "react";
import {
  View,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Text } from "../components/ui/text";
import { NoahButton } from "../components/ui/NoahButton";
import { Button } from "~/components/ui/button";

import {
  useGenerateLightningInvoice,
  useGenerateOnchainAddress,
  useGenerateOffchainAddress,
} from "../hooks/usePayments";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { satsToBtc, formatNumber } from "~/lib/utils";
import { useReceiveScreen } from "../hooks/useReceiveScreen";
import { FontAwesome } from "@expo/vector-icons";
import { COLORS } from "~/lib/styleConstants";
import { ReceiveMethodPicker, type ReceiveMethod } from "~/components/ReceiveMethodPicker";

const ReceiveScreen = () => {
  const navigation = useNavigation();
  const { amount, setAmount, currency, toggleCurrency, amountSat, btcPrice } = useReceiveScreen();
  const [copied, setCopied] = useState(false);
  const [bip321Uri, setBip321Uri] = useState<string | undefined>(undefined);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<ReceiveMethod>("lightning");

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
    // Generate URI if we have at least one payment method
    if (onchainAddress || vtxoPubkey || lightningInvoice) {
      let uri = "";

      if (onchainAddress) {
        uri = `bitcoin:${onchainAddress}`;
        const params = [];

        if (vtxoPubkey) {
          params.push(`ark=${vtxoPubkey}`);
        }
        if (lightningInvoice) {
          params.push(`lightning=${lightningInvoice}`);
        }
        if (amountSat >= 330) {
          const amountInBtc = satsToBtc(amountSat);
          params.push(`amount=${amountInBtc}`);
        }

        if (params.length > 0) {
          uri += `?${params.join("&")}`;
        }
      } else if (lightningInvoice) {
        // If only lightning invoice, use the invoice directly
        uri = lightningInvoice;
      } else if (vtxoPubkey) {
        // If only ark address, use it directly
        uri = vtxoPubkey;
      }

      setBip321Uri(uri.toUpperCase());
    }
  }, [onchainAddress, vtxoPubkey, lightningInvoice, amountSat]);

  const handleGenerate = (method: ReceiveMethod = "bip321") => {
    if (amountSat && amountSat < 330) {
      Alert.alert("Invalid Amount", "The minimum amount is 330 sats.");
      return;
    }

    // Generate based on selected method
    switch (method) {
      case "bip321":
        generateOnchainAddress();
        generateOffchainAddress();
        if (amountSat >= 330) {
          generateLightningInvoice(amountSat);
        } else {
          generateLightningInvoice(0);
        }
        break;
      case "ark":
        generateOffchainAddress();
        break;
      case "lightning":
        if (amountSat >= 330) {
          generateLightningInvoice(amountSat);
        } else {
          generateLightningInvoice(0);
        }
        break;
      case "onchain":
        generateOnchainAddress();
        break;
    }
  };

  const handleLongPress = () => {
    setShowMethodPicker(true);
  };

  const handleMethodSelect = (method: ReceiveMethod) => {
    setSelectedMethod(method);
    setShowMethodPicker(false);
    handleGenerate(method);
  };

  const handleClear = () => {
    setBip321Uri(undefined);
    setAmount("");
    setSelectedMethod("lightning");
    setShowMethodPicker(false);
    // Reset all mutations to clear their data
    resetOffchainAddress();
    resetOnchainAddress();
    resetLightningInvoice();
  };

  const handleCopyToClipboard = (value: string) => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  const truncateAddress = (addr: string) => {
    if (addr.length <= 100) {
      return addr;
    }
    return `${addr.slice(0, 20)}...${addr.slice(-20)}`;
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background p-4">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 p-4">
          <View className="flex-row items-center mb-8">
            <Pressable onPress={() => navigation.goBack()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">Receive</Text>
          </View>

          <View className="flex-row items-center justify-center my-4">
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
            <TouchableOpacity onPress={toggleCurrency} className="ml-2">
              <FontAwesome name="arrows-v" size={24} color={COLORS.BITCOIN_ORANGE} />
            </TouchableOpacity>
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

          {showMethodPicker ? (
            <View className="mt-8">
              <ReceiveMethodPicker selectedMethod={selectedMethod} onSelect={handleMethodSelect} />
            </View>
          ) : (
            <View className="flex-row items-center justify-between mt-8 gap-4">
              {bip321Uri ? (
                <View className="flex-1">
                  <Button onPress={handleClear} variant="outline">
                    <Text>Clear</Text>
                  </Button>
                </View>
              ) : null}
              <View className="flex-1">
                <NoahButton
                  onPress={() => handleGenerate()}
                  onLongPress={handleLongPress}
                  isLoading={isLoading}
                  disabled={isLoading}
                >
                  Generate
                </NoahButton>
              </View>
            </View>
          )}

          {bip321Uri && (
            <View className="mt-8 p-4 bg-card rounded-lg items-center">
              <View className="p-2 bg-white rounded-lg">
                <QRCode value={bip321Uri} size={200} backgroundColor="white" color="black" />
              </View>
              <Pressable onPress={() => handleCopyToClipboard(bip321Uri)} className="mt-4 p-2">
                <Text
                  className={`text-base text-center break-words ${
                    copied ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {truncateAddress(bip321Uri)}
                </Text>
                <Text
                  className={`text-sm text-center mt-2 ${
                    copied ? "text-muted-foreground" : "text-primary"
                  }`}
                >
                  {copied ? "Copied!" : "Tap to copy"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default ReceiveScreen;
