import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import { useIsFocused } from "@react-navigation/native";
import { NoahSafeAreaView } from "./NoahSafeAreaView";
import { Text } from "./ui/text";
import { Button } from "./ui/button";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";

type QRCodeScannerProps = {
  codeScanner: any;
  onClose: () => void;
};

export const QRCodeScanner = ({ codeScanner, onClose }: QRCodeScannerProps) => {
  const device = useCameraDevice("back");
  const isFocused = useIsFocused();

  if (!device) {
    return (
      <NoahSafeAreaView className="flex-1 bg-background justify-center items-center p-4">
        <Text className="text-lg text-center">No camera device found.</Text>
        <Button onPress={onClose} className="mt-4">
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
        isActive={isFocused}
        codeScanner={codeScanner}
      />
      <SafeAreaView>
        <Pressable onPress={onClose} className="m-4 self-start">
          <Icon name="close-circle" size={32} color="white" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
};
