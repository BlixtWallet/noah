import { NitroModules } from "react-native-nitro-modules";
import type { NoahTools, HttpResponse } from "./NoahTools.nitro";

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

export function playAudio(filePath: string): Promise<void> {
  return NoahToolsHybridObject.playAudio(filePath);
}

export function pauseAudio(): void {
  return NoahToolsHybridObject.pauseAudio();
}

export function stopAudio(): void {
  return NoahToolsHybridObject.stopAudio();
}

export function resumeAudio(): void {
  return NoahToolsHybridObject.resumeAudio();
}

export function seekAudio(positionSeconds: number): void {
  return NoahToolsHybridObject.seekAudio(positionSeconds);
}

export function getAudioDuration(): number {
  return NoahToolsHybridObject.getAudioDuration();
}

export function getAudioPosition(): number {
  return NoahToolsHybridObject.getAudioPosition();
}

export function isAudioPlaying(): boolean {
  return NoahToolsHybridObject.isAudioPlaying();
}

export function saveBalanceForWidget(
  totalBalance: number,
  onchainBalance: number,
  offchainBalance: number,
  pendingBalance: number,
  appGroup: string,
): void {
  return NoahToolsHybridObject.saveBalanceForWidget(
    totalBalance,
    onchainBalance,
    offchainBalance,
    pendingBalance,
    appGroup,
  );
}

export function hasGooglePlayServices(): boolean {
  return NoahToolsHybridObject.hasGooglePlayServices();
}

export function registerUnifiedPush(topic: string): void {
  return NoahToolsHybridObject.registerUnifiedPush(topic);
}

export function unregisterUnifiedPush(): void {
  return NoahToolsHybridObject.unregisterUnifiedPush();
}

export function getUnifiedPushEndpoint(): Promise<string> {
  return NoahToolsHybridObject.getUnifiedPushEndpoint();
}

export type { HttpResponse } from "./NoahTools.nitro";
