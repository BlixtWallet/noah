import { syncWallet } from "~/lib/sync";
import { captureException, logger as sentryLogger } from "@sentry/react-native";
import { isWalletLoaded } from "react-native-nitro-ark";
import { loadWallet } from "./walletApi";
import logger from "~/lib/log";
import { peakKeyPair } from "./paymentsApi";

const log = logger("tasks");

export async function backgroundSync() {
  try {
    log.d("[Background Job] loading wallet in background");
    const isLoaded = await isWalletLoaded();
    log.d("[Background Job] isWalletLoaded", [isLoaded]);
    if (!isLoaded) {
      log.d("[Background Job] wallet not loaded, loading now");
      await loadWallet();
    }

    log.d("[Background Job] syncing wallet in background");
    await syncWallet();
    const { public_key: pubkey } = await peakKeyPair(0);

    log.d("[Background Job] wallet synced in background", [pubkey]);

    sentryLogger.info("Background notification task executed and wallet synced", { pubkey });
  } catch (e) {
    captureException(
      new Error(`Failed to background sync: ${e instanceof Error ? e.message : String(e)}`),
    );
    log.e("[Background Job] error", [e]);
  }
}

export async function maintenance() {
  log.d("[Maintenance Job] running");
  // Add maintenance logic here in the future
}
