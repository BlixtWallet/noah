import { loadWalletIfNeeded, maintanance } from "./walletApi";
import logger from "~/lib/log";
import { bolt11Invoice, offboardAllArk } from "./paymentsApi";
import { err, ok, Result } from "neverthrow";
import { BackupService } from "~/lib/backupService";
import { submitInvoice as submitInvoiceApi } from "./api";
import { updateOffboardingRequestStatus } from "./transactionsDb";
import { verifyMessage } from "./crypto";
import { validateBitcoinAddress } from "bip-321";
import { Bolt11Invoice } from "react-native-nitro-ark";
import { APP_VARIANT } from "~/config";

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

export async function submitInvoice(
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

export async function offboardTask(
  requestId: string,
  address: string,
  addressSignature: string,
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

  // Verify the address signature to prevent tampering
  const verifyResult = await verifyMessage(address, addressSignature, 0);
  if (verifyResult.isErr()) {
    const e = new Error("Failed to verify address signature");
    log.e(e.message, [verifyResult.error]);
    return err(e);
  }

  if (!verifyResult.value) {
    const e = new Error(
      "Address signature verification failed - address may have been tampered with",
    );
    log.e(e.message);
    return err(e);
  }

  log.d("[Offboard Job] address signature verified successfully");

  const btcValidation = validateBitcoinAddress(address);
  if (!btcValidation.valid) {
    const e = new Error("Invalid Bitcoin address");
    log.e(e.message, [address]);
    return err(e);
  }

  if (btcValidation.network !== APP_VARIANT) {
    const e = new Error(`Network mismatch: expected ${APP_VARIANT}, got ${btcValidation.network}`);
    log.e(e.message, [address]);
    return err(e);
  }

  const offboardResult = await offboardAllArk(address);
  if (offboardResult.isErr()) {
    log.e("Offboarding failed", [offboardResult.error]);
    return err(offboardResult.error);
  }

  log.d("[Offboard Job] offboarding result is ", [offboardResult.value]);

  const onchainTxid =
    offboardResult.value.funding_txid ?? offboardResult.value.unsigned_funding_txids?.[0];

  const updateResult = await updateOffboardingRequestStatus(requestId, "completed", onchainTxid);
  if (updateResult.isErr()) {
    log.e("Failed to update offboarding request status", [updateResult.error]);
    return err(updateResult.error);
  }
  log.d("[Offboard Job] completed", [requestId]);

  return ok(undefined);
}
