import { Result, ok, err } from "neverthrow";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair } from "./paymentsApi";
import { signMessage } from "./walletApi";

const API_URL = getServerEndpoint();

async function post<T, U>(
  endpoint: string,
  payload: T,
  authenticated = true,
): Promise<Result<U, Error>> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    let body: string;

    if (authenticated) {
      const peakResult = await peakKeyPair(0);
      if (peakResult.isErr()) {
        return err(peakResult.error);
      }
      const { public_key: key } = peakResult.value;

      const k1 = Math.random().toString(36).substring(2);

      const signatureResult = await signMessage(k1, 0);
      if (signatureResult.isErr()) {
        return err(signatureResult.error);
      }
      const sig = signatureResult.value;

      headers["X-Noah-Auth-K1"] = k1;
      headers["X-Noah-Auth-Sig"] = sig;
      headers["X-Noah-Auth-Key"] = key;
      body = JSON.stringify(payload);
    } else {
      body = JSON.stringify(payload);
    }

    const response = await fetch(`${API_URL}/v0${endpoint}`, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err(new Error(`API Error: ${response.status} ${errorText}`));
    }

    const data = await response.json();
    return ok(data);
  } catch (e) {
    return err(e as Error);
  }
}

export const getUploadUrl = (payload: { backup_version: number; backup_size: number }) =>
  post<{ backup_version: number; backup_size: number }, { upload_url: string; s3_key: string }>(
    "/backup/upload_url",
    payload,
  );

export const completeUpload = (payload: {
  s3_key: string;
  backup_version: number;
  backup_size: number;
}) => post("/backup/complete_upload", payload);

export const listBackups = () =>
  post<{}, { backup_version: number; created_at: string; backup_size: number }[]>(
    "/backup/list",
    {},
  );

export const getDownloadUrl = (payload: { backup_version?: number }) =>
  post<{ backup_version?: number }, { download_url: string; backup_size: number }>(
    "/backup/download_url",
    payload,
  );

export const deleteBackup = (payload: { backup_version: number }) =>
  post("/backup/delete", payload);

export const updateBackupSettings = (payload: { backup_enabled: boolean }) =>
  post("/backup/settings", payload);
