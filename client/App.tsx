import "./global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React from "react";
import { AlertProvider } from "~/contexts/AlertProvider";
import AppNavigation from "~/Navigators";
import * as Sentry from "@sentry/react-native";
import { useColorScheme, View } from "react-native";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { queryClient } from "~/queryClient";
import { APP_VARIANT } from "~/config";
const isDebugModeOrRegtest = __DEV__ || APP_VARIANT === "regtest";

if (!isDebugModeOrRegtest) {
  Sentry.init({
    dsn: "https://ac229acf494dda7d1d84eebcc14f7769@o4509731937648640.ingest.us.sentry.io/4509731938435072",
    sendDefaultPii: true,
    integrations: [
      Sentry.feedbackIntegration({
        showName: true,
        showEmail: true,
        isNameRequired: false,
        isEmailRequired: false,
      }),
    ],
  });
}

const AppContent = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View className={`flex-1 ${isDark ? "dark" : ""}`}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AlertProvider>
              <AppNavigation />
            </AlertProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </View>
  );
};

const App = () => {
  return <AppContent />;
};

export default isDebugModeOrRegtest ? App : Sentry.wrap(App);
