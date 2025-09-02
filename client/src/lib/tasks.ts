import { syncWallet } from "~/lib/sync";
import { loadWalletIfNeeded, maintanance } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice, offboardAllArk, onchainAddress } from "./paymentsApi";
import { err, ok, Result } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import { peakKeyPair } from "./crypto";
import { submitInvoice as submitInvoiceApi } from "./api";
import { updateOffboardingRequestStatus } from "./transactionsDb";

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
}

export async function maintenance(): Promise<Result<void, Error>> {
  log.d("[Maintenance Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    const e = new Error("Failed to load wallet for maintenance");
    log.e(e.message, [loadResult.error]);
    return err(e);
  }

  const maintenanceResult = await maintanance();
  if (maintenanceResult.isErr()) {
    log.e("Maintenance failed", [maintenanceResult.error]);
    return err(maintenanceResult.error);
  }
  log.d("[Maintenance Job] completed");
  return ok(undefined);
}

export async function submitInvoice(k1: string, amountMsat: number) {
  log.d("[submitInvoice Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet for submitting invoice", [loadResult.error]);
    return;
  }

  const sats = amountMsat / 1000;

  const invoiceResult = await bolt11Invoice(sats);
  if (invoiceResult.isErr()) {
    log.e("Failed to create bolt11 invoice", [invoiceResult.error]);
    return;
  }
  const invoice = invoiceResult.value;

  const responseResult = await submitInvoiceApi({
    invoice,
    k1,
  });

  if (responseResult.isErr()) {
    log.e("Failed to submit invoice", [responseResult.error]);
    return;
  }

  log.d("[Submit Invoice Job] completed");
}

// Shared backup function that can be used by both hooks and background tasks

export async function triggerBackupTask(): Promise<Result<void, Error>> {
  log.d("[Backup Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    const e = new Error("Failed to load wallet for backup");
    log.e(e.message, [loadResult.error]);
    return err(e);
  }

  const backupService = new BackupService();

  const backupResult = await backupService.performBackup();
  if (backupResult.isErr()) {
    log.e("Backup job failed", [backupResult.error]);
    return err(backupResult.error);
  }

  log.d("[Backup Job] completed successfully");
  return ok(undefined);
}

export async function offboardTask(requestId: string): Promise<Result<void, Error>> {
  log.d("[Offboard Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    const e = new Error("Failed to load wallet for offboarding");
    log.e(e.message, [loadResult.error]);
    return err(e);
  }

  const address = await onchainAddress();
  if (address.isErr()) {
    const e = new Error("Failed to get onchain address");
    log.e(e.message, [address.error]);
    return err(e);
  }

  const offboardResult = await offboardAllArk(address.value);
  if (offboardResult.isErr()) {
    log.e("Offboarding failed", [offboardResult.error]);
    return err(offboardResult.error);
  }

  const updateResult = await updateOffboardingRequestStatus(requestId, "completed");
  if (updateResult.isErr()) {
    log.e("Failed to update offboarding request status", [updateResult.error]);
    return err(updateResult.error);
  }
  log.d("[Offboard Job] completed", [requestId]);

  return ok(undefined);
}
