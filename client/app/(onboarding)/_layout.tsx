import React from "react";
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "default" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="configuration" />
      <Stack.Screen name="mnemonic" />
      <Stack.Screen name="restore-wallet" />
      <Stack.Screen name="lightning-address" />
    </Stack>
  );
}
