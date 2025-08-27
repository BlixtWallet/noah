import React from "react";
import { useSendScreen } from "../hooks/useSendScreen";
import { SendSuccess } from "../components/SendSuccess";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { QRCodeScanner } from "~/components/QRCodeScanner";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import Icon from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { COLORS } from "~/lib/styleConstants";
import { formatNumber } from "~/lib/utils";
import { useNavigation } from "@react-navigation/native";
import { NoahButton } from "~/components/ui/NoahButton";

const SendScreen = () => {
  const navigation = useNavigation();
  const {
    destination,
    setDestination,
    amount,
    setAmount,
    isAmountEditable,
    comment,
    setComment,
    parsedResult,
    handleSend,
    handleDone,
    isSending,
    showCamera,
    setShowCamera,
    handleScanPress,
    codeScanner,
    currency,
    toggleCurrency,
    amountSat,
    btcPrice,
  } = useSendScreen();

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    setDestination(text);
  };

  if (parsedResult?.success) {
    return <SendSuccess parsedResult={parsedResult} handleDone={handleDone} />;
  }

  if (showCamera) {
    return <QRCodeScanner codeScanner={codeScanner} onClose={() => setShowCamera(false)} />;
  }

  return (
    <NoahSafeAreaView className="flex-1 bg-background p-4">
      <View className="flex-row items-center p-4">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
          <Icon name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-foreground">Send</Text>
        <View className="flex-1 items-end">
          <TouchableOpacity onPress={handleScanPress}>
            <Icon name="scan" size={28} color="white" />
          </TouchableOpacity>
        </View>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-center my-4">
          <TextInput
            className="text-white text-5xl font-bold text-center"
            placeholder="0"
            placeholderTextColor="#6b7280"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            editable={isAmountEditable}
          />
          <TouchableOpacity onPress={toggleCurrency} className="ml-2">
            <FontAwesome name="arrows-v" size={24} color={COLORS.BITCOIN_ORANGE} />
          </TouchableOpacity>
        </View>
        <Text className="text-gray-400 text-center text-lg">
          {currency === "SATS"
            ? `$${btcPrice ? formatNumber(((amountSat * btcPrice) / 100000000).toFixed(2)) : "0.00"}`
            : `${formatNumber(amountSat)} sats`}
        </Text>

        <View className="mt-8">
          <View className="flex-row items-center border border-border bg-card p-4 rounded-lg">
            <TextInput
              className="flex-1 text-white"
              placeholder="Address, invoice, or lightning address"
              placeholderTextColor="#6b7280"
              value={destination}
              onChangeText={setDestination}
            />
            <TouchableOpacity onPress={handlePaste} className="p-2">
              <Text className="text-white">Paste</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            className="border border-border bg-card p-4 rounded-lg text-foreground mt-4"
            placeholder="Note to self"
            placeholderTextColor="#6b7280"
            value={comment}
            onChangeText={setComment}
          />
        </View>
        <NoahButton onPress={handleSend} isLoading={isSending} className="mt-9">
          Send
        </NoahButton>
      </View>
    </NoahSafeAreaView>
  );
};

export default SendScreen;
