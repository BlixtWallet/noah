import "./global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React from "react";
import { AlertProvider } from "~/contexts/AlertProvider";
// Navigation is now handled by Expo Router in app/_layout.tsx
import * as Sentry from "@sentry/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { queryClient } from "~/queryClient";
import { APP_VARIANT } from "~/config";
const isDebugModeOrRegtest = __DEV__ || APP_VARIANT === "regtest";

if (!isDebugModeOrRegtest) {
  Sentry.init({
    dsn: "https://ac229acf494dda7d1d84eebcc14f7769@o4509731937648640.ingest.us.sentry.io/4509731938435072",

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,
    integrations: [Sentry.feedbackIntegration()],

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,
  });
}

const App = () => {
  return (
    // This file is no longer used with Expo Router
    // The app entry point is now handled by app/_layout.tsx
    // You can safely delete this file
    null
  );
};

export default isDebugModeOrRegtest ? App : Sentry.wrap(App);
