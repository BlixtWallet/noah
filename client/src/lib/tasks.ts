import { loadWalletIfNeeded, maintanance } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice, offboardAllArk } from "./paymentsApi";
import { err, ok, Result } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import { submitInvoice as submitInvoiceApi } from "./api";
import { updateOffboardingRequestStatus } from "./transactionsDb";
import { isValidBitcoinAddress } from "~/constants";

const log = logger("tasks");

export async function maintenance(): Promise<Result<void, Error>> {
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

export async function submitInvoice(transaction_id: string, k1: string, amountMsat: number) {
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
    transaction_id,
    k1, // Use k1 from notification for auth optimization
  });

  if (responseResult.isErr()) {
    log.e("Failed to submit invoice", [responseResult.error]);
    return;
  }

  log.d("[Submit Invoice Job] completed");
}

// Shared backup function that can be used by both hooks and background tasks

export async function triggerBackupTask(): Promise<Result<void, Error>> {
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

export async function offboardTask(
  requestId: string,
  address: string,
): Promise<Result<void, Error>> {
  log.d("[Offboard Job] running");
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    const e = new Error("Failed to load wallet for offboarding");
    log.e(e.message, [loadResult.error]);
    return err(e);
  }

  log.d("[Offboard Job] offboarding request id is ", [requestId]);
  log.d("[Offboard Job] onchain address is ", [address]);

  if (!isValidBitcoinAddress(address)) {
    const e = new Error("Invalid Bitcoin address");
    log.e(e.message, [address]);
    return err(e);
  }

  const offboardResult = await offboardAllArk(address);
  if (offboardResult.isErr()) {
    log.e("Offboarding failed", [offboardResult.error]);
    return err(offboardResult.error);
  }

  log.d("[Offboard Job] offboarding result is ", [offboardResult.value]);

  const updateResult = await updateOffboardingRequestStatus(
    requestId,
    "completed",
    offboardResult.value,
  );
  if (updateResult.isErr()) {
    log.e("Failed to update offboarding request status", [updateResult.error]);
    return err(updateResult.error);
  }
  log.d("[Offboard Job] completed", [requestId]);

  return ok(undefined);
}
