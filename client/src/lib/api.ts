/// <reference lib="dom" />
import { Result, ok, err, ResultAsync } from "neverthrow";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair, signMessage } from "./crypto";
import { loadWalletIfNeeded } from "./walletApi";
import {
  AppVersionCheckPayload,
  AppVersionInfo,
  BackupInfo,
  BackupSettingsPayload,
  CompleteUploadPayload,
  DeleteBackupPayload,
  DownloadUrlResponse,
  GetDownloadUrlPayload,
  GetUploadUrlPayload,
  HeartbeatResponsePayload,
  RegisterResponse,
  RegisterOffboardingRequestPayload,
  RegisterOffboardingResponse,
  RegisterPushToken,
  UpdateLnAddressPayload,
  UploadUrlResponse,
  ReportJobStatusPayload,
  DefaultSuccessPayload,
  SubmitInvoicePayload,
  RegisterPayload,
} from "~/types/serverTypes";
import logger from "~/lib/log";
import ky from "ky";
import { nativeGet, nativePost } from "noah-tools";

const log = logger("serverApi");

const API_URL = getServerEndpoint();

async function post<T, U>(
  endpoint: string,
  payload: T & { k1?: string },
  authenticated = true,
): Promise<Result<U, Error>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authenticated) {
      const walletResult = await loadWalletIfNeeded();
      if (walletResult.isErr()) {
        return err(walletResult.error);
      }

      const k1 = payload.k1 ?? (await getK1()).unwrapOr(undefined);

      if (!k1) {
        return err(new Error("Failed to get k1 for authentication"));
      }

      const peakResult = await peakKeyPair(0);

      if (peakResult.isErr()) {
        log.w("Failed to derive public key for authentication", [peakResult.error]);
        return err(peakResult.error);
      }
      const { public_key: key } = peakResult.value;

      const signatureResult = await signMessage(k1, 0);

      if (signatureResult.isErr()) {
        log.w("Failed to sign message for authentication", [signatureResult.error]);
        return err(signatureResult.error);
      }
      const sig = signatureResult.value;

      headers["x-auth-k1"] = k1;
      headers["x-auth-sig"] = sig;
      headers["x-auth-key"] = key;
    }

    const body = JSON.stringify(payload);
    const url = `${API_URL}/v0${endpoint}`;

    // Always use native HTTP client for all requests
    const responseResult = await ResultAsync.fromPromise(
      nativePost(
        url,
        body,
        headers,
        30, // 30 second timeout
      ),
      (e) => e as Error,
    );

    if (responseResult.isErr()) {
      return err(responseResult.error);
    }

    const response = responseResult.value;

    if (response.status >= 200 && response.status < 300) {
      // Handle successful responses with no body (e.g. 204 No Content)
      if (!response.body || response.body === "") {
        return ok(undefined as unknown as U);
      }

      const responseJson = Result.fromThrowable(
        () => {
          return JSON.parse(response.body) as U;
        },
        (e) => new Error(`Failed to parse JSON response: ${(e as Error).message}`),
      )();

      if (responseJson.isErr()) {
        log.e("Failed to parse JSON response", [responseJson.error, response.body]);
        return err(responseJson.error);
      }

      return ok(responseJson.value);
    } else {
      return err(new Error(`HTTP ${response.status}: ${response.body}`));
    }
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

export const registerWithServer = (payload: RegisterPayload) =>
  post<RegisterPayload, RegisterResponse>("/register", payload);

export const updateLightningAddress = (payload: UpdateLnAddressPayload) =>
  post<UpdateLnAddressPayload, DefaultSuccessPayload>("/update_ln_address", payload);

export const registerPushToken = (payload: RegisterPushToken) =>
  post<RegisterPushToken, DefaultSuccessPayload>("/register_push_token", payload);

export const registerOffboardingRequest = (payload: RegisterOffboardingRequestPayload) =>
  post<RegisterOffboardingRequestPayload, RegisterOffboardingResponse>(
    "/register_offboarding_request",
    payload,
  );

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

export const heartbeatResponse = (payload: HeartbeatResponsePayload & { k1?: string }) =>
  post<HeartbeatResponsePayload & { k1?: string }, DefaultSuccessPayload>(
    "/heartbeat_response",
    payload,
  );

export const getK1 = async (): Promise<Result<string, Error>> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const responseResult = await ResultAsync.fromPromise(
    nativeGet(`${API_URL}/v0/getk1`, headers, 30),
    (e) => e as Error,
  );

  if (responseResult.isErr()) {
    return err(responseResult.error);
  }

  const response = responseResult.value;

  if (response.status < 200 || response.status >= 300) {
    return err(new Error(`HTTP ${response.status}: ${response.body}`));
  }

  if (!response.body) {
    return err(new Error("Empty response body from getk1"));
  }

  const parseResult = Result.fromThrowable(
    () => JSON.parse(response.body) as { k1: string },
    (e) => new Error(`Failed to parse JSON response: ${(e as Error).message}`),
  )();

  if (parseResult.isErr()) {
    return err(parseResult.error);
  }

  return ok(parseResult.value.k1);
};

export const getDownloadUrlForRestore = async (payload: {
  backup_version?: number;
  k1: string;
  sig: string;
  key: string;
}): Promise<Result<DownloadUrlResponse, Error>> => {
  const { k1, sig, key, ...restPayload } = payload;
  try {
    const headers = {
      "Content-Type": "application/json",
      "x-auth-k1": k1,
      "x-auth-sig": sig,
      "x-auth-key": key,
    };

    const response = await ky
      .post(`${API_URL}/v0/backup/download_url`, {
        headers,
        json: restPayload,
      })
      .json<DownloadUrlResponse>();

    return ok(response);
  } catch (e) {
    return err(e as Error);
  }
};

export const deregister = () => post<object, DefaultSuccessPayload>("/deregister", {});

export const checkAppVersion = async (
  clientVersion: string,
): Promise<Result<AppVersionInfo, Error>> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const payload: AppVersionCheckPayload = {
    client_version: clientVersion,
  };

  const body = JSON.stringify(payload);
  const url = `${API_URL}/v0/app_version`;

  const responseResult = await ResultAsync.fromPromise(
    nativePost(url, body, headers, 30),
    (e) => e as Error,
  );

  if (responseResult.isErr()) {
    return err(responseResult.error);
  }

  const response = responseResult.value;

  if (response.status < 200 || response.status >= 300) {
    return err(new Error(`HTTP ${response.status}: ${response.body}`));
  }

  if (!response.body) {
    return err(new Error("Empty response body from app_version"));
  }

  const parseResult = Result.fromThrowable(
    () => JSON.parse(response.body) as AppVersionInfo,
    (e) => new Error(`Failed to parse JSON response: ${(e as Error).message}`),
  )();

  if (parseResult.isErr()) {
    return err(parseResult.error);
  }

  return ok(parseResult.value);
};
