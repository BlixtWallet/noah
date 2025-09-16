import { NitroModules } from "react-native-nitro-modules";
import type { NoahTools, HttpResponse, NfcPaymentData, NfcStatus } from "./NoahTools.nitro";

const NoahToolsHybridObject = NitroModules.createHybridObject<NoahTools>("NoahTools");
export type LogLevel = "verbose" | "debug" | "info" | "warn" | "error";

export function getAppVariant(): "mainnet" | "signet" | "regtest" {
  return NoahToolsHybridObject.getAppVariant() as "mainnet" | "signet" | "regtest";
}

export function getAppLogs(): Promise<string[]> {
  return NoahToolsHybridObject.getAppLogs();
}

export function createBackup(mnemonic: string): Promise<string> {
  return NoahToolsHybridObject.createBackup(mnemonic);
}

export function restoreBackup(encryptedData: string, mnemonic: string): Promise<boolean> {
  return NoahToolsHybridObject.restoreBackup(encryptedData, mnemonic);
}

export function nativePost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutSeconds: number = 30,
): Promise<HttpResponse> {
  return NoahToolsHybridObject.nativePost(url, body, headers, timeoutSeconds);
}

export function nativeGet(
  url: string,
  headers: Record<string, string>,
  timeoutSeconds: number = 30,
): Promise<HttpResponse> {
  return NoahToolsHybridObject.nativeGet(url, headers, timeoutSeconds);
}

export function nativeLog(level: LogLevel, tag: string, message: string): void {
  return NoahToolsHybridObject.nativeLog(level, tag, message);
}

// NFC functions
export function checkNfcStatus(): Promise<NfcStatus> {
  return NoahToolsHybridObject.checkNfcStatus();
}

export function startNfcSend(paymentData: NfcPaymentData): Promise<boolean> {
  return NoahToolsHybridObject.startNfcSend(JSON.stringify(paymentData));
}

export function startNfcReceive(): Promise<NfcPaymentData> {
  return NoahToolsHybridObject.startNfcReceive().then((data) => JSON.parse(data));
}

export function stopNfc(): void {
  return NoahToolsHybridObject.stopNfc();
}

export type { HttpResponse, NfcPaymentData, NfcStatus } from "./NoahTools.nitro";
