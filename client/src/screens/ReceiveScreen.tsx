import React, { useEffect, useState } from "react";
import { View, Pressable, TouchableWithoutFeedback, Keyboard } from "react-native";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
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
import { satsToBtc } from "~/lib/utils";

const ReceiveScreen = () => {
  const navigation = useNavigation();
  const [amount, setAmount] = useState("");
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
      const amountInSats = parseInt(amount);
      let uri = `bitcoin:${onchainAddress}?ark=${vtxoPubkey}&lightning=${lightningInvoice}`;
      if (!isNaN(amountInSats) && amountInSats >= 330) {
        const amountInBtc = satsToBtc(amountInSats);
        uri += `&amount=${amountInBtc}`;
      }
      setBip321Uri(uri);
    }
  }, [onchainAddress, vtxoPubkey, lightningInvoice, amount]);

  const handleGenerate = () => {
    const amountInSats = parseInt(amount);
    if (!isNaN(amountInSats) && amountInSats >= 330) {
      generateLightningInvoice(amountInSats);
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
            <Text className="text-2xl font-bold text-foreground">Receive Funds</Text>
          </View>

          <View className="mb-4">
            <Text className="text-lg text-muted-foreground mb-2">Amount (sats)</Text>
            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder="Optional"
              keyboardType="numeric"
              className="border-border bg-card p-4 rounded-lg text-foreground"
            />
          </View>

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
