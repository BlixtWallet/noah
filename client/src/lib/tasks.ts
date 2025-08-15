import { syncWallet } from "~/lib/sync";
import { logger as sentryLogger } from "@sentry/react-native";
import { loadWalletIfNeeded, maintanance, signMessage } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice, peakKeyPair } from "./paymentsApi";
import { getServerEndpoint } from "~/constants";

const log = logger("tasks");

export async function backgroundSync() {
  await loadWalletIfNeeded();

  log.d("[Background Job] syncing wallet in background");
  await syncWallet();
  const { public_key: pubkey } = await peakKeyPair(0);

  log.d("[Background Job] wallet synced in background", [pubkey]);

  sentryLogger.info("Background notification task executed and wallet synced", { pubkey });
}

export async function maintenance() {
  log.d("[Maintenance Job] running");
  await loadWalletIfNeeded();

  await maintanance();
  log.d("[Maintenance Job] completed");
}

export async function submitInvoice(requestId: string, amountMsat: number) {
  log.d("[submitInvoice Job] running");
  await loadWalletIfNeeded();

  const serverEndpoint = getServerEndpoint();
  const url = `${serverEndpoint}/v0/lnurlp/submit_invoice`;

  const index = 0;
  const { public_key: key } = await peakKeyPair(index);
  const signature = await signMessage(requestId, index);

  const sats = amountMsat / 1000;

  const invoice = await bolt11Invoice(sats);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      k1: requestId,
      invoice,
      key,
      sig: signature,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to submit invoice: ${response.status} ${errorBody}`);
  }

  log.d("[Submit Invoice Job] completed");
}
