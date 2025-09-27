import React from "react";
import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "default" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="mnemonic" />
      <Stack.Screen name="logs" />
      <Stack.Screen name="lightning-address" />
      <Stack.Screen name="backup-settings" />
      <Stack.Screen name="vtxos" />
      <Stack.Screen name="vtxo-detail" />
    </Stack>
  );
}
