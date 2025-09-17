/// <reference types="node" />
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useWalletStore } from "../store/walletStore";
import { syncWallet } from "../lib/sync";
import logger from "~/lib/log";

const log = logger("useSyncManager");

export function useSyncManager(intervalMs: number = 30000) {
  const { isInitialized, isWalletLoaded } = useWalletStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);

  log.i("Starting useSyncManager");

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
  }, [isInitialized, isWalletLoaded, intervalMs]);

  return true;
}
