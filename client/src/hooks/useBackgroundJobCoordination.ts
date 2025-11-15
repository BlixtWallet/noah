import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useWalletStore } from "~/store/walletStore";
import logger from "~/lib/log";

const log = logger("useBackgroundJobCoordination");

/**
 * Hook to coordinate background jobs and prevent race conditions with foreground operations.
 *
 * ## The Problem
 * When a push notification triggers background wallet operations (maintenance, sync),
 * and the user opens the app simultaneously, both try to access wallet resources concurrently.
 * This causes operations to conflict, resulting in the app hanging in a loading state.
 *
 * ## How It Works
 *
 * ### Normal Flow (No Background Job):
 * 1. User opens app
 * 2. Hook checks: isBackgroundJobRunning = false
 * 3. Wallet loads immediately
 *
 * ### Background Job Running:
 * 1. Push notification arrives → sets isBackgroundJobRunning = true
 * 2. User opens app while background job is running
 * 3. Hook detects background job and waits (max 10s)
 * 4. Background job completes → sets isBackgroundJobRunning = false
 * 5. Hook proceeds with callback execution
 *
 * ### Stale Flag Protection:
 * If background job crashes and finally block never executes:
 * 1. Background job starts → flag = true, timestamp = recorded
 * 2. Job crashes → finally never runs → flag stays true
 * 3. [60 seconds pass]
 * 4. User opens app → triggers clearStaleBackgroundJobFlag()
 * 5. Check: Date.now() - timestamp > 60000ms?
 * 6. YES → log warning, set flag = false
 * 7. Callback executes immediately, no 10s wait.
 *
 * ### Multiple Safety Checks:
 * - Before every operation: clearStaleBackgroundJobFlag()
 * - When app comes to foreground: clearStaleBackgroundJobFlag()
 * - Timeout protection: won't wait forever (max 10s)
 *
 * @returns {Function} safelyExecuteWhenReady - Wrapper function that waits for background jobs
 *                                               before executing the provided callback
 */
export const useBackgroundJobCoordination = () => {
  const { clearStaleBackgroundJobFlag } = useWalletStore();
  const isBackgroundJobRunning = useWalletStore((state) => state.isBackgroundJobRunning);

  /**
   * Executes a callback function only after ensuring no background jobs are running.
   * Includes timeout protection and stale flag detection.
   *
   * @param callback - Async function to execute once it's safe
   * @returns Promise that resolves when callback completes
   */
  const safelyExecuteWhenReady = useCallback(
    async <T>(callback: () => Promise<T>): Promise<T> => {
      // First, check if the background job flag is stale and clear it if needed
      clearStaleBackgroundJobFlag();

      const maxWaitTime = 10000; // 10 seconds max wait
      const checkInterval = 100; // Check every 100ms
      let waited = 0;

      // Wait for background job to complete if one is running
      // Read the initial state from the store
      const isInitiallyRunning = useWalletStore.getState().isBackgroundJobRunning;
      if (isInitiallyRunning) {
        log.i("Background job detected, waiting for completion before executing callback");
      }

      // Always read fresh value from store in the loop
      while (useWalletStore.getState().isBackgroundJobRunning && waited < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }

      if (waited >= maxWaitTime) {
        log.w("Timed out waiting for background job to complete, proceeding anyway");
      } else if (waited > 0) {
        log.d(`Background job completed after ${waited}ms, executing callback`);
      }

      return callback();
    },
    [clearStaleBackgroundJobFlag],
  );

  /**
   * Clear stale background job flags when app comes to foreground.
   * This catches cases where background jobs crashed and the flag was never cleared.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        log.d("App came to foreground, checking for stale background job flags");
        clearStaleBackgroundJobFlag();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clearStaleBackgroundJobFlag]);

  return {
    safelyExecuteWhenReady,
    isBackgroundJobRunning,
  };
};
