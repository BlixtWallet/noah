import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React from "react";
import { AlertProvider } from "~/contexts/AlertProvider";
import AppNavigation from "~/Navigators";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AlertProvider>
          <AppNavigation />
        </AlertProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
