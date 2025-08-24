import { Result, ok, err, ResultAsync } from "neverthrow";
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

    let body;

    if (authenticated) {
      const k1Result = await ResultAsync.fromPromise(
        fetch(`${API_URL}/v0/getk1`).then((res) => res.json()),
        (e) => e as Error,
      );

      if (k1Result.isErr()) {
        return err(k1Result.error);
      }

      const { k1 } = k1Result.value;

      const peakResult = await peakKeyPair(0);
      if (peakResult.isErr()) {
        return err(peakResult.error);
      }
      const { public_key: key } = peakResult.value;

      const signatureResult = await signMessage(k1, 0);
      if (signatureResult.isErr()) {
        return err(signatureResult.error);
      }
      const sig = signatureResult.value;

      const authPayload = {
        ...payload,
        k1,
        sig,
        key,
      };
      body = JSON.stringify(authPayload);
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

    // Handle cases where response might be empty
    const responseText = await response.text();
    if (!responseText) {
      return ok(undefined as U);
    }

    const data = JSON.parse(responseText);
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
  post<object, { backup_version: number; created_at: string; backup_size: number }[]>(
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

export const registerWithServer = () =>
  post<object, { lightning_address: string }>("/register", {});

export const updateLightningAddress = (payload: { ln_address: string }) =>
  post("/update_ln_address", payload);

export const registerPushToken = (payload: { push_token: string }) =>
  post("/register_push_token", payload);
