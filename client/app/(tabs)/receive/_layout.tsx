import React from "react";
import { Stack } from "expo-router";

export default function ReceiveLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "default" }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
