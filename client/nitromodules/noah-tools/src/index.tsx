import { NitroModules } from "react-native-nitro-modules";
import type { NoahTools } from "./NoahTools.nitro";

const NoahToolsHybridObject = NitroModules.createHybridObject<NoahTools>("NoahTools");

export function getAppVariant(): "mainnet" | "signet" | "regtest" {
  return NoahToolsHybridObject.getAppVariant() as "mainnet" | "signet" | "regtest";
}

export function getAppLogs(): Promise<string[]> {
  return NoahToolsHybridObject.getAppLogs();
}

export function zipDirectory(sourceDirectory: string, outputZipPath: string): Promise<string> {
  return NoahToolsHybridObject.zipDirectory(sourceDirectory, outputZipPath);
}

export function unzipFile(zipPath: string, outputDirectory: string): Promise<string> {
  return NoahToolsHybridObject.unzipFile(zipPath, outputDirectory);
}

export function encryptBackup(backupPath: string, seedphrase: string): Promise<string> {
  return NoahToolsHybridObject.encryptBackup(backupPath, seedphrase);
}

export function decryptBackup(
  encryptedData: string,
  seedphrase: string,
  outputPath: string,
): Promise<string> {
  return NoahToolsHybridObject.decryptBackup(encryptedData, seedphrase, outputPath);
}
