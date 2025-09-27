import "../global.css";
import "~/lib/pushNotifications";

import React from "react";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as Sentry from "@sentry/react-native";

import { AlertProvider } from "~/contexts/AlertProvider";
import { PortalHost } from "@rn-primitives/portal";
import { queryClient } from "~/queryClient";
import { APP_VARIANT } from "~/config";
import { useWalletStore } from "~/store/walletStore";
import WalletLoader from "~/components/WalletLoader";
import AppServices from "~/AppServices";

const isDebugModeOrRegtest = __DEV__ || APP_VARIANT === "regtest";

if (!isDebugModeOrRegtest) {
  Sentry.init({
    dsn: "https://ac229acf494dda7d1d84eebcc14f7769@o4509731937648640.ingest.us.sentry.io/4509731938435072",
    sendDefaultPii: true,
    integrations: [Sentry.feedbackIntegration()],
  });
}

function RootLayoutNav() {
  const { isInitialized } = useWalletStore();

  return (
    <>
      {isInitialized && (
        <WalletLoader>
          <AppServices />
        </WalletLoader>
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider value={DarkTheme}>
            <AlertProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
              <PortalHost />
            </AlertProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default isDebugModeOrRegtest ? RootLayout : Sentry.wrap(RootLayout);
