import { syncWallet } from "~/lib/sync";
import { captureException, logger as sentryLogger } from "@sentry/react-native";
import { isWalletLoaded } from "react-native-nitro-ark";
import { loadWallet, maintanance } from "./walletApi";
import logger from "~/lib/log";
import { peakKeyPair } from "./paymentsApi";

const log = logger("tasks");

async function loadWalletIfNeeded() {
  const isLoaded = await isWalletLoaded();
  log.d("[Background Job] isWalletLoaded", [isLoaded]);
  if (!isLoaded) {
    log.d("[Background Job] wallet not loaded, loading now");
    await loadWallet();
  }
}

export async function backgroundSync() {
  try {
    await loadWalletIfNeeded();

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
  await loadWalletIfNeeded();

  await maintanance();
  log.d("[Maintenance Job] completed");
}
