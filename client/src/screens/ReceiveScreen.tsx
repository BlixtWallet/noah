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

const ReceiveScreen = () => {
  const navigation = useNavigation();
  const { amount, setAmount, currency, toggleCurrency, amountSat, btcPrice } = useReceiveScreen();
  const [copied, setCopied] = useState(false);
  const [bip321Uri, setBip321Uri] = useState<string | undefined>(undefined);

  const {
    mutate: generateOffchainAddress,
    data: vtxoPubkey,
    isPending: isGeneratingVtxo,
  } = useGenerateOffchainAddress();

  const {
    mutate: generateOnchainAddress,
    data: onchainAddress,
    isPending: isGeneratingOnchain,
  } = useGenerateOnchainAddress();

  const {
    mutate: generateLightningInvoice,
    data: lightningInvoice,
    isPending: isGeneratingLightning,
  } = useGenerateLightningInvoice();

  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;

  useEffect(() => {
    generateOnchainAddress();
    generateOffchainAddress();
    generateLightningInvoice(0);
  }, [generateLightningInvoice, generateOffchainAddress, generateOnchainAddress]);

  useEffect(() => {
    if (onchainAddress && vtxoPubkey && lightningInvoice) {
      let uri = `bitcoin:${onchainAddress}?ark=${vtxoPubkey}&lightning=${lightningInvoice}`;
      if (amountSat >= 330) {
        const amountInBtc = satsToBtc(amountSat);
        uri += `&amount=${amountInBtc}`;
      }
      setBip321Uri(uri.toUpperCase());
    }
  }, [onchainAddress, vtxoPubkey, lightningInvoice, amountSat]);

  const handleGenerate = () => {
    if (amountSat && amountSat < 330) {
      Alert.alert("Invalid Amount", "The minimum amount is 330 sats.");
      return;
    }

    if (amountSat >= 330) {
      generateLightningInvoice(amountSat);
    } else {
      generateLightningInvoice(0);
    }
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

          <NoahButton
            onPress={handleGenerate}
            isLoading={isLoading}
            disabled={isLoading}
            className="mt-8"
          >
            Generate
          </NoahButton>

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
