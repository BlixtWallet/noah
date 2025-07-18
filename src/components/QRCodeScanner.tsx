import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
    <View className="flex-1">
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        codeScanner={codeScanner}
      />
      <View className="flex-1 bg-transparent">
        <View className="flex-1 bg-black/60" />
        <View className="flex-row h-[250px]">
          <View className="flex-1 bg-black/60" />
          <View className="w-[250px] h-[250px] border-2 border-white rounded-lg" />
          <View className="flex-1 bg-black/60" />
        </View>
        <View className="flex-1 bg-black/60" />
      </View>
      <SafeAreaView className="absolute top-0 left-0 right-0">
        <Pressable onPress={onClose} className="m-4 self-start">
          <Icon name="close-circle" size={32} color="white" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
};
