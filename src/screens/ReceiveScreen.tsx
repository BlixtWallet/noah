import React, { useEffect, useState } from "react";
import { View, Pressable, TouchableWithoutFeedback, Keyboard } from "react-native";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
import { NoahButton } from "../components/ui/NoahButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  useGenerateLightningInvoice,
  useGenerateOnchainAddress,
  useGenerateVtxoPubkey,
} from "../hooks/usePayments";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { ArkIcon } from "~/lib/icons/Ark";
import { LightningIcon } from "~/lib/icons/Lightning";
import { OnchainIcon } from "~/lib/icons/Onchain";

type ReceiveType = "ark" | "onchain" | "lightning";

const receiveTypeDisplay: Record<ReceiveType, string> = {
  ark: "Ark",
  onchain: "On-chain",
  lightning: "Lightning",
};

const receiveTypeDescription: Record<ReceiveType, string> = {
  ark: "Instant, low-fee Ark payments",
  onchain: "Standard Bitcoin transaction",
  lightning: "Fast payments via Lightning Network",
};

const ReceiveScreen = () => {
  const navigation = useNavigation();
  const [receiveType, setReceiveType] = useState<ReceiveType | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const {
    mutate: generateVtxoPubkey,
    data: vtxoPubkey,
    isPending: isGeneratingVtxo,
    reset: resetVtxo,
  } = useGenerateVtxoPubkey();

  const {
    mutate: generateOnchainAddress,
    data: onchainAddress,
    isPending: isGeneratingOnchain,
    reset: resetOnchain,
  } = useGenerateOnchainAddress();

  const {
    mutate: generateLightningInvoice,
    data: lightningInvoice,
    isPending: isGeneratingLightning,
    reset: resetLightning,
  } = useGenerateLightningInvoice();

  const isLoading = isGeneratingVtxo || isGeneratingOnchain || isGeneratingLightning;
  const address =
    receiveType === "ark"
      ? vtxoPubkey
      : receiveType === "onchain"
        ? onchainAddress
        : lightningInvoice;

  useEffect(() => {
    if (receiveType === "ark") {
      resetOnchain();
      resetLightning();
    } else if (receiveType === "onchain") {
      resetVtxo();
      resetLightning();
    } else if (receiveType === "lightning") {
      resetVtxo();
      resetOnchain();
    }
  }, [receiveType, resetOnchain, resetVtxo, resetLightning]);

  const handleGenerate = () => {
    if (receiveType === "ark") {
      generateVtxoPubkey(undefined);
    } else if (receiveType === "onchain") {
      generateOnchainAddress();
    } else if (receiveType === "lightning") {
      generateLightningInvoice(parseInt(amount));
    }
  };

  const handleCopyToClipboard = (value: string) => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  const currentSelectValue = receiveType
    ? { value: receiveType, label: receiveTypeDisplay[receiveType] }
    : undefined;

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
            <Text className="text-lg text-muted-foreground mb-2">Receive via</Text>
            <Select
              value={currentSelectValue}
              onValueChange={(v) => v && setReceiveType(v.value as ReceiveType)}
            >
              <SelectTrigger>
                <SelectValue
                  className="text-foreground text-sm native:text-lg"
                  placeholder="Select receive type..."
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  label={receiveTypeDisplay.ark}
                  value="ark"
                  icon={<ArkIcon className="w-4 h-4 mr-2 text-foreground" />}
                  description={receiveTypeDescription.ark}
                />
                <SelectItem
                  label={receiveTypeDisplay.lightning}
                  value="lightning"
                  icon={<LightningIcon className="w-4 h-4 mr-2 text-foreground" />}
                  description={receiveTypeDescription.lightning}
                />
                <SelectItem
                  label={receiveTypeDisplay.onchain}
                  value="onchain"
                  icon={<OnchainIcon className="w-4 h-4 mr-2 text-foreground" />}
                  description={receiveTypeDescription.onchain}
                />
              </SelectContent>
            </Select>
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
            disabled={isLoading || !receiveType}
            className="mt-8"
          >
            Generate
          </NoahButton>

          {address && (
            <View className="mt-8 p-4 bg-card rounded-lg items-center">
              <View className="p-2 bg-white rounded-lg">
                <QRCode value={address} size={200} backgroundColor="white" color="black" />
              </View>
              <Pressable onPress={() => handleCopyToClipboard(address)} className="mt-4 p-2">
                <Text
                  className={`text-base text-center break-words ${
                    copied ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {truncateAddress(address)}
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
