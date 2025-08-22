import type { HybridObject } from "react-native-nitro-modules";

export interface NoahTools extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  getAppVariant(): string;
  getAppLogs(): Promise<string[]>;
  zipDirectory(sourceDirectory: string, outputZipPath: string): Promise<string>;
  encryptBackup(backupPath: string, seedphrase: string): Promise<string>;
  decryptBackup(encryptedData: string, seedphrase: string, outputPath: string): Promise<string>;
}
