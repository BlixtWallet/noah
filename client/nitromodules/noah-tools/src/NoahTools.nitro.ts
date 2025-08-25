import type { HybridObject } from "react-native-nitro-modules";

export interface NoahTools extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  getAppVariant(): string;
  getAppLogs(): Promise<string[]>;
  zipDirectory(sourceDirectory: string, outputZipPath: string): Promise<string>;
  unzipFile(zipPath: string, outputDirectory: string): Promise<string>;
  encryptBackup(backupPath: string, mnemonic: string): Promise<string>;
  decryptBackup(encryptedData: string, mnemonic: string, outputPath: string): Promise<string>;
}
