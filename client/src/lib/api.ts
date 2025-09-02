import { Result, ok, err, ResultAsync } from "neverthrow";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair, signMessage } from "./crypto";
import { loadWalletIfNeeded } from "./walletApi";
import {
  BackupInfo,
  BackupSettingsPayload,
  CompleteUploadPayload,
  DeleteBackupPayload,
  DownloadUrlResponse,
  GetDownloadUrlPayload,
  GetUploadUrlPayload,
  LNUrlAuthResponse,
  RegisterOffboardingResponse,
  RegisterPushToken,
  UpdateLnAddressPayload,
  UploadUrlResponse,
  ReportJobStatusPayload,
  DefaultSuccessPayload,
  SubmitInvoicePayload,
} from "~/types/serverTypes";
import logger from "~/lib/log";

const log = logger("serverApi");

const API_URL = getServerEndpoint();

async function post<T, U>(
  endpoint: string,
  payload: T & { k1?: string },
  authenticated = true,
): Promise<Result<U, Error>> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (authenticated) {
      const walletResult = await loadWalletIfNeeded();
      log.d("Wallet load result", [walletResult]);
      if (walletResult.isErr()) {
        return err(walletResult.error);
      }

      log.d("Payload", [payload]);

      const k1 = payload.k1 ?? (await getK1()).unwrapOr(undefined);

      if (!k1) {
        return err(new Error("Failed to get k1 for authentication"));
      }

      log.d("k1 is", [k1]);

      const peakResult = await peakKeyPair(0);

      if (peakResult.isErr()) {
        log.d("Failed to derive public key for authentication", [peakResult.error]);
        return err(peakResult.error);
      }
      const { public_key: key } = peakResult.value;

      log.d("Derived public key", [key]);

      const signatureResult = await signMessage(k1, 0);

      if (signatureResult.isErr()) {
        log.d("Failed to sign message for authentication", [signatureResult.error]);
        return err(signatureResult.error);
      }
      const sig = signatureResult.value;

      log.d("Signature", [sig]);

      headers["x-auth-k1"] = k1;
      headers["x-auth-sig"] = sig;
      headers["x-auth-key"] = key;
    }

    const body = JSON.stringify(payload);

    const response = await ResultAsync.fromPromise(
      fetch(`${API_URL}/v0${endpoint}`, {
        method: "POST",
        headers,
        body,
      }),
      (e) => e as Error,
    );

    if (response.isErr()) {
      log.d("Failed to send request", [response.error]);
      return err(response.error);
    }

    const responseValue = response.value;

    if (!responseValue.ok) {
      log.d("API Error", [responseValue.status, responseValue.statusText]);
      const errorText = await responseValue.text();
      return err(new Error(`API Error: ${responseValue.status} ${errorText}`));
    }

    if (responseValue.status === 204) {
      log.d("Empty response from server (204 No Content)");
      return ok(undefined as U);
    }

    // Handle cases where response might be empty
    const responseJson = await responseValue.json();
    if (!responseJson) {
      log.d("Empty response from server");
      return ok(undefined as U);
    }

    log.d("Response from server", [responseJson]);

    return ok(responseJson);
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

export const deleteBackup = (payload: DeleteBackupPayload) =>
  post<DeleteBackupPayload, DefaultSuccessPayload>("/backup/delete", payload);

export const updateBackupSettings = (payload: BackupSettingsPayload) =>
  post<BackupSettingsPayload, DefaultSuccessPayload>("/backup/settings", payload);

export const registerWithServer = () => post<object, LNUrlAuthResponse>("/register", {});

export const updateLightningAddress = (payload: UpdateLnAddressPayload) =>
  post<UpdateLnAddressPayload, DefaultSuccessPayload>("/update_ln_address", payload);

export const registerPushToken = (payload: RegisterPushToken) =>
  post<RegisterPushToken, DefaultSuccessPayload>("/register_push_token", payload);

export const registerOffboardingRequest = () =>
  post<object, RegisterOffboardingResponse>("/register_offboarding_request", {});

export const reportJobStatus = (payload: ReportJobStatusPayload & { k1?: string }) =>
  post<ReportJobStatusPayload & { k1?: string }, DefaultSuccessPayload>(
    "/report_job_status",
    payload,
  );

export const submitInvoice = (payload: SubmitInvoicePayload & { k1?: string }) =>
  post<SubmitInvoicePayload & { k1?: string }, DefaultSuccessPayload>(
    "/lnurlp/submit_invoice",
    payload,
  );

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
