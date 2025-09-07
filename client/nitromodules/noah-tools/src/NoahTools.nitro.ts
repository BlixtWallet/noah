import type { HybridObject } from "react-native-nitro-modules";

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface NoahTools extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  getAppVariant(): string;
  getAppLogs(): Promise<string[]>;
  createBackup(mnemonic: string): Promise<string>;
  restoreBackup(encryptedData: string, mnemonic: string): Promise<boolean>;

  // Native HTTP client for POST requests
  nativePost(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutSeconds: number,
  ): Promise<HttpResponse>;
}
