import { NitroModules } from "react-native-nitro-modules";
import type { NoahTools } from "./NoahTools.nitro";

const NoahToolsHybridObject = NitroModules.createHybridObject<NoahTools>("NoahTools");

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
