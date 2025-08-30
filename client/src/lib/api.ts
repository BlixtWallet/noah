import { Result, ok, err, ResultAsync } from "neverthrow";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair, signMessage } from "./crypto";
import {
  BackupInfo,
  BackupSettingsPayload,
  CompleteUploadPayload,
  DeleteBackupPayload,
  DownloadUrlResponse,
  GetDownloadUrlPayload,
  GetUploadUrlPayload,
  LNUrlAuthResponse,
  RegisterPushToken,
  UpdateLnAddressPayload,
  UploadUrlResponse,
  ReportJobStatusPayload,
} from "~/types/serverTypes";

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

    if (authenticated) {
      const k1Result = await getK1();
      if (k1Result.isErr()) {
        return err(k1Result.error);
      }

      const k1 = k1Result.value;

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

      headers["x-auth-k1"] = k1;
      headers["x-auth-sig"] = sig;
      headers["x-auth-key"] = key;
    }

    const body = JSON.stringify(payload);

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

export const getUploadUrl = (payload: GetUploadUrlPayload) =>
  post<GetUploadUrlPayload, UploadUrlResponse>("/backup/upload_url", payload);

export const completeUpload = (payload: CompleteUploadPayload) =>
  post("/backup/complete_upload", payload);

export const listBackups = () => post<object, BackupInfo[]>("/backup/list", {});

export const getDownloadUrl = (payload: GetDownloadUrlPayload) =>
  post<GetDownloadUrlPayload, DownloadUrlResponse>("/backup/download_url", payload);

export const deleteBackup = (payload: DeleteBackupPayload) => post("/backup/delete", payload);

export const updateBackupSettings = (payload: BackupSettingsPayload) =>
  post("/backup/settings", payload);

export const registerWithServer = () => post<object, LNUrlAuthResponse>("/register", {});

export const updateLightningAddress = (payload: UpdateLnAddressPayload) =>
  post("/update_ln_address", payload);

export const registerPushToken = (payload: RegisterPushToken) =>
  post("/register_push_token", payload);
export const reportJobStatus = (payload: ReportJobStatusPayload) =>
  post("/report_job_status", payload);

export const getK1 = async () => {
  const k1Result = await ResultAsync.fromPromise(
    fetch(`${API_URL}/v0/getk1`).then((res) => res.json()),
    (e) => e as Error,
  );

  if (k1Result.isErr()) {
    return err(k1Result.error);
  }

  const { k1 } = k1Result.value;
  return ok(k1);
};

export const getDownloadUrlForRestore = async (payload: {
  backup_version?: number;
  k1: string;
  sig: string;
  key: string;
}): Promise<Result<DownloadUrlResponse, Error>> => {
  const { k1, sig, key, ...restPayload } = payload;
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-auth-k1": k1,
      "x-auth-sig": sig,
      "x-auth-key": key,
    };

    const body = JSON.stringify(restPayload);

    const response = await fetch(`${API_URL}/v0/backup/download_url`, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err(new Error(`API Error: ${response.status} ${errorText}`));
    }

    const responseText = await response.text();
    if (!responseText) {
      return err(new Error("API Error: Empty response from server"));
    }

    const data = JSON.parse(responseText);
    return ok(data);
  } catch (e) {
    return err(e as Error);
  }
};
