import React, { useState, useEffect } from "react";
import { View, Pressable, StyleSheet, Keyboard, TouchableWithoutFeedback } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { NoahButton } from "../components/ui/NoahButton";
import { parseDestination, isValidDestination, type DestinationTypes } from "../lib/sendUtils";
import { useSend } from "../hooks/usePayments";
import { useAlert } from "~/contexts/AlertProvider";
import SuccessAnimation from "../components/SuccessAnimation";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  useCameraPermission,
} from "react-native-vision-camera";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { SafeAreaView } from "react-native-safe-area-context";

type SendResult = {
  amount_sat: number;
  destination_pubkey: string;
  txid?: string;
  success: boolean;
  type: string;
};

const SendScreen = () => {
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [isAmountEditable, setIsAmountEditable] = useState(true);
  const [comment, setComment] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [parsedResult, setParsedResult] = useState<SendResult | null>(null);
  const [destinationType, setDestinationType] = useState<DestinationTypes | null>(null);

  useEffect(() => {
    if (destination) {
      const {
        destinationType: newDestinationType,
        amount: newAmount,
        isAmountEditable: newIsAmountEditable,
        error: parseError,
      } = parseDestination(destination);

      if (parseError) {
        showAlert({ title: "Invalid Destination", description: parseError });
      }

      setDestinationType(newDestinationType);
      setAmount(newAmount?.toString() ?? "");
      setIsAmountEditable(newIsAmountEditable);
    } else {
      setDestinationType(null);
      setAmount("");
      setIsAmountEditable(true);
    }
  }, [destination, showAlert]);

  const {
    mutate: send,
    isPending: isSending,
    data: result,
    error,
    reset,
  } = useSend(destinationType);

  useEffect(() => {
    if (result) {
      try {
        if (destinationType === "lightning") {
          setParsedResult({
            success: true,
            amount_sat: parseInt(amount, 10) || 0,
            destination_pubkey: destination,
            txid: result,
            type: "lightning",
          });
        } else {
          const parsed = JSON.parse(result);
          setParsedResult(parsed);
        }
      } catch (e) {
        console.error("Failed to parse send result", e);
        setParsedResult({
          success: false,
          amount_sat: 0,
          destination_pubkey: "",
          type: "error",
        });
      }
    }
  }, [result, destinationType, amount, destination]);

  const handleSend = () => {
    let amountSat: number | null = parseInt(amount, 10);

    if (!isValidDestination(destination)) {
      showAlert({
        title: "Invalid Destination",
        description: "Please enter a valid Bitcoin address, BOLT11 invoice, or Ark public key.",
      });
      return;
    }
    if (isNaN(amountSat) || amountSat <= 0) {
      showAlert({ title: "Invalid Amount", description: "Please enter a valid amount." });
      return;
    }

    if (destinationType === "lightning" && amountSat !== 0) {
      amountSat = null;
    }

    const cleanedDestination = destination.replace(/^(bitcoin:|lightning:)/i, "");

    console.log("send details", cleanedDestination, amountSat, comment);
    send({
      destination: cleanedDestination,
      amountSat,
      comment: comment || null,
    });
  };

  const handleDone = () => {
    reset();
    setParsedResult(null);
    setDestination("");
    setAmount("");
    setComment("");
  };

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const isFocused = useIsFocused();

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "ean-13"],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) {
        const scannedValue = codes[0].value;
        // TODO: This can be improved to parse different QR code types (BIP21, LNURL, etc.)
        if (isValidDestination(scannedValue)) {
          setDestination(scannedValue);
          setShowCamera(false);
        } else {
          setShowCamera(false);
          showAlert({
            title: "Invalid QR Code",
            description:
              "The scanned QR code does not contain a valid Bitcoin address, BOLT11 invoice, or Ark public key.",
          });
        }
      }
    },
  });

  const handleScanPress = async () => {
    if (!hasPermission) {
      const permissionGranted = await requestPermission();
      if (!permissionGranted) {
        showAlert({
          title: "Permission required",
          description: "Camera permission is required to scan QR codes.",
        });
        return;
      }
    }
    setShowCamera(true);
  };

  const errorMessage = error instanceof Error ? error.message : String(error);

  if (parsedResult?.success) {
    return (
      <NoahSafeAreaView className="flex-1 bg-background justify-center items-center py-4">
        <SuccessAnimation className="mb-8" />
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground">Amount:</Text>
              <Text className="text-foreground font-semibold">
                {parsedResult.amount_sat.toLocaleString()} sats
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground">Type:</Text>
              <Text className="text-foreground font-semibold">{parsedResult.type}</Text>
            </View>
            <View>
              <Text className="text-muted-foreground">Destination:</Text>
              <Text
                className="text-foreground font-semibold"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {parsedResult.destination_pubkey}
              </Text>
            </View>
            {parsedResult.txid && (
              <View className="mt-2">
                <Text className="text-muted-foreground">Transaction ID:</Text>
                <Text
                  className="text-foreground font-semibold"
                  ellipsizeMode="middle"
                  numberOfLines={1}
                >
                  {parsedResult.txid}
                </Text>
              </View>
            )}
          </CardContent>
        </Card>
        <NoahButton onPress={handleDone} className="w-full mt-8">
          Done
        </NoahButton>
      </NoahSafeAreaView>
    );
  }

  if (showCamera) {
    if (!device) {
      return (
        <NoahSafeAreaView className="flex-1 bg-background justify-center items-center p-4">
          <Text className="text-lg text-center">No camera device found.</Text>
          <Button onPress={() => setShowCamera(false)} className="mt-4">
            <Text>Back</Text>
          </Button>
        </NoahSafeAreaView>
      );
    }
    return (
      <View style={StyleSheet.absoluteFill}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused && showCamera}
          codeScanner={codeScanner}
        />
        <SafeAreaView>
          <Pressable onPress={() => setShowCamera(false)} className="m-4 self-start">
            <Icon name="close-circle" size={32} color="white" />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 p-4">
          <View className="flex-row items-center justify-between mb-8">
            <View className="flex-row items-center">
              <Pressable onPress={() => navigation.goBack()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color="white" />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">Send</Text>
            </View>
            <Pressable onPress={handleScanPress}>
              <Icon name="qr-code-outline" size={28} color="white" />
            </Pressable>
          </View>

          <View className="space-y-4">
            <View>
              <Text className="text-lg text-muted-foreground mb-2">Destination</Text>
              <Input
                value={destination}
                onChangeText={setDestination}
                placeholder="Lightning / Onchain / Ark"
                className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
              />
            </View>
            <View>
              <Text className="text-lg text-muted-foreground mb-2">Amount (sats)</Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder="Enter amount"
                keyboardType="numeric"
                className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
                editable={isAmountEditable}
              />
            </View>
            <View>
              <Text className="text-lg text-muted-foreground mb-2">Comment (Optional)</Text>
              <Input
                value={comment}
                onChangeText={setComment}
                placeholder="Add a note"
                className="border-border bg-card p-4 rounded-lg text-foreground mb-2"
              />
            </View>
          </View>

          <NoahButton onPress={handleSend} isLoading={isSending} className="mt-8">
            Send
          </NoahButton>

          {(error || (parsedResult && !parsedResult.success)) && (
            <View className="mt-8 p-4 bg-destructive rounded-lg items-center">
              <Text className="text-lg font-bold text-destructive-foreground mb-2">Error</Text>
              <Text className="text-base text-center text-destructive-foreground">
                {error ? errorMessage : "The transaction failed. Please try again."}
              </Text>
              <Button onPress={handleDone} variant="secondary" className="mt-4">
                <Text>Try Again</Text>
              </Button>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </NoahSafeAreaView>
  );
};

export default SendScreen;
