import React from "react";
import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "default" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="board-ark" />
      <Stack.Screen name="send-to" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="transaction-detail" />
      <Stack.Screen name="boarding-transactions" />
      <Stack.Screen name="boarding-transaction-detail" />
    </Stack>
  );
}
