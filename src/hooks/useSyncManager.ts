import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppState, AppStateStatus } from "react-native";
import { useWalletStore } from "../store/walletStore";
import { sync } from "../lib/walletApi";

import logger from "~/lib/log";
const log = logger("useSyncManager");

// Provisional hook to sync balance in the background
// In Blixt we used to do these things with easy-peasy state manager, but that
// does not work well with React Query
export function useSyncManager(intervalMs: number = 30000) {
  const queryClient = useQueryClient();
  const { isInitialized, isWalletLoaded } = useWalletStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);

  log.i("Starting useSyncManager");

  const syncWallet = useCallback(async () => {
    if (!isInitialized || !isWalletLoaded || !isActiveRef.current) {
      return;
    }

    log.i("syncWallet");

    try {
      await sync();
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
    } catch (error) {
      log.e("background sync failed:", [error]);
    }
  }, [isInitialized, isWalletLoaded, queryClient]);

  useEffect(() => {
    if (!isInitialized || !isWalletLoaded) {
      return;
    }

    // Start periodic sync
    intervalRef.current = setInterval(syncWallet, intervalMs);

    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      log.i("handleAppStateChange", [nextAppState]);
      isActiveRef.current = nextAppState === "active";

      if (nextAppState === "active") {
        log.i("app became active");
        // Sync immediately when app becomes active
        syncWallet();
        // Restart interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(syncWallet, intervalMs);
      } else if (nextAppState === "background") {
        log.i("app entered background");
        // Pause syncing when app is backgrounded
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription.remove();
    };
  }, [isInitialized, isWalletLoaded, intervalMs, syncWallet]);

  return true;
}
