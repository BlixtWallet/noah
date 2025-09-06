import React from "react";
import { useSendScreen } from "../hooks/useSendScreen";
import { SendSuccess } from "../components/SendSuccess";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { QRCodeScanner } from "~/components/QRCodeScanner";
import {
  View,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import Icon from "@react-native-vector-icons/ionicons";
import { Bip321Picker } from "../components/Bip321Picker";
import * as Clipboard from "expo-clipboard";
import { COLORS } from "~/lib/styleConstants";
import { formatNumber, satsToUsd } from "~/lib/utils";
import { useNavigation } from "@react-navigation/native";
import { Button } from "~/components/ui/button";
import { NoahButton } from "~/components/ui/NoahButton";
import { Text } from "~/components/ui/text";

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
    parsedAmount,
    bip321Data,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    handleClear,
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1">
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
              {currency === "USD" && <Text className="text-white text-3xl font-bold mr-2">$</Text>}
              <TextInput
                className="text-white text-3xl font-bold text-center h-20"
                placeholder="0"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                editable={isAmountEditable}
                style={!isAmountEditable ? { color: "gray" } : {}}
              />
              {currency === "SATS" && (
                <Text className="text-white text-3xl font-bold ml-2">sats</Text>
              )}
              {!parsedAmount && (
                <TouchableOpacity onPress={toggleCurrency} className="ml-2">
                  <FontAwesome name="arrows-v" size={24} color={COLORS.BITCOIN_ORANGE} />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-gray-400 text-center text-xl">
              {parsedAmount
                ? `${formatNumber(parsedAmount)} sats ($${
                    btcPrice ? formatNumber(satsToUsd(parsedAmount, btcPrice)) : "0.00"
                  })`
                : currency === "SATS"
                  ? `$${
                      btcPrice && amountSat && !isNaN(amountSat)
                        ? formatNumber(satsToUsd(amountSat, btcPrice))
                        : "0.00"
                    }`
                  : `${!isNaN(amountSat) && amount ? formatNumber(amountSat) : 0} sats`}
            </Text>

            {bip321Data ? (
              <Bip321Picker
                bip321Data={bip321Data}
                selectedPaymentMethod={selectedPaymentMethod}
                onSelect={setSelectedPaymentMethod}
              />
            ) : (
              <View className="mt-8 ml-4 mr-4">
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
                  placeholder="Add a note (optional)"
                  placeholderTextColor="#6b7280"
                  value={comment}
                  onChangeText={setComment}
                />
              </View>
            )}
            <View className="flex-row items-center justify-between mt-9 mr-4 ml-4 gap-4">
              {destination ? (
                <View className="flex-1">
                  <Button onPress={handleClear} variant="outline">
                    <Text>Cancel</Text>
                  </Button>
                </View>
              ) : null}
              <View className="flex-1">
                <NoahButton
                  onPress={handleSend}
                  disabled={!destination || isSending}
                  isLoading={isSending}
                >
                  Send
                </NoahButton>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default SendScreen;
