import { syncWallet } from "~/lib/sync";
import { logger as sentryLogger } from "@sentry/react-native";
import { loadWalletIfNeeded, maintanance } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice } from "./paymentsApi";
import { getServerEndpoint } from "~/constants";
import { ResultAsync } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import { peakKeyPair, signMessage } from "./crypto";

const log = logger("tasks");

export async function backgroundSync() {
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet in background", [loadResult.error]);
    return;
  }

  log.d("[Background Job] syncing wallet in background");
  await syncWallet();
  const peakResult = await peakKeyPair(0);
  if (peakResult.isErr()) {
    log.e("Failed to peak key pair in background", [peakResult.error]);
    return;
  }
  const { public_key: pubkey } = peakResult.value;

  log.d("[Background Job] wallet synced in background", [pubkey]);

  sentryLogger.info("Background notification task executed and wallet synced", { pubkey });
}

export async function maintenance() {
  log.d("[Maintenance Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet for maintenance", [loadResult.error]);
    return;
  }

  const maintenanceResult = await maintanance();
  if (maintenanceResult.isErr()) {
    log.e("Maintenance failed", [maintenanceResult.error]);
    return;
  }
  log.d("[Maintenance Job] completed");
}

export async function submitInvoice(requestId: string, amountMsat: number) {
  log.d("[submitInvoice Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet for submitting invoice", [loadResult.error]);
    return;
  }

  const serverEndpoint = getServerEndpoint();
  const url = `${serverEndpoint}/v0/lnurlp/submit_invoice`;

  const index = 0;
  const peakResult = await peakKeyPair(index);
  if (peakResult.isErr()) {
    log.e("Failed to peak key pair for submitting invoice", [peakResult.error]);
    return;
  }
  const { public_key: key } = peakResult.value;

  const signatureResult = await signMessage(requestId, index);
  if (signatureResult.isErr()) {
    log.e("Failed to sign message for submitting invoice", [signatureResult.error]);
    return;
  }
  const signature = signatureResult.value;

  const sats = amountMsat / 1000;

  const invoiceResult = await bolt11Invoice(sats);
  if (invoiceResult.isErr()) {
    log.e("Failed to create bolt11 invoice", [invoiceResult.error]);
    return;
  }
  const invoice = invoiceResult.value;

  const responseResult = await ResultAsync.fromPromise(
    fetch(url, {
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
    }),
    (e) => e as Error,
  );

  if (responseResult.isErr()) {
    log.e("Failed to submit invoice", [responseResult.error]);
    return;
  }

  const response = responseResult.value;

  if (!response.ok) {
    const errorBody = await response.text();
    log.e("Failed to submit invoice", [response.status, errorBody]);
    return;
  }

  log.d("[Submit Invoice Job] completed");
}

// Shared backup function that can be used by both hooks and background tasks

export async function triggerBackupTask() {
  log.d("[Backup Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet for backup", [loadResult.error]);
    return;
  }

  const backupService = new BackupService();

  const backupResult = await backupService.performBackup();
  if (backupResult.isErr()) {
    log.e("Backup job failed", [backupResult.error]);
    return;
  }

  log.d("[Backup Job] completed successfully");
}
