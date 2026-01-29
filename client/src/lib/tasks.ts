import { loadWalletIfNeeded, maintenanceWithOnchainDelegated, sync } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice } from "./paymentsApi";
import { err, ok, Result } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import { submitInvoice as submitInvoiceApi } from "./api";
import { Bolt11Invoice } from "react-native-nitro-ark";

const log = logger("tasks");

export async function maintenanceTask(): Promise<Result<void, Error>> {
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    const e = new Error("Failed to load wallet for maintenance");
    log.e(e.message, [loadResult.error]);
    return err(e);
  }

  const maintenanceResult = await maintenanceWithOnchainDelegated();
  if (maintenanceResult.isErr()) {
    log.e("Maintenance failed", [maintenanceResult.error]);
    return err(maintenanceResult.error);
  }
  log.d("[Maintenance Job] completed");

  return ok(undefined);
}

export async function submitInvoiceTask(
  transaction_id: string,
  k1: string,
  amountMsat: number,
): Promise<Result<Bolt11Invoice, Error>> {
  const loadResult = await loadWalletIfNeeded();
  if (loadResult.isErr()) {
    log.e("Failed to load wallet for submitting invoice", [loadResult.error]);
    return err(loadResult.error);
  }

  const sats = amountMsat / 1000;

  const invoiceResult = await bolt11Invoice(sats);
  if (invoiceResult.isErr()) {
    log.e("Failed to create bolt11 invoice", [invoiceResult.error]);
    return err(invoiceResult.error);
  }
  const invoice = invoiceResult.value.payment_request;

  const responseResult = await submitInvoiceApi({
    invoice,
    transaction_id,
    k1, // Use k1 from notification for auth optimization
  });

  if (responseResult.isErr()) {
    log.e("Failed to submit invoice", [responseResult.error]);
    return err(responseResult.error);
  }

  log.d("[Submit Invoice Job] completed");

  return ok(invoiceResult.value);
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
