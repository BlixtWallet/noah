/// <reference lib="dom" />
import { Result, ok, err, ResultAsync } from "neverthrow";
import { getServerEndpoint } from "~/constants";
import { getMnemonic } from "./crypto";
import { deriveKeypairFromMnemonic, signMesssageWithMnemonic } from "./walletApi";
import { APP_VARIANT } from "~/config";
import {
  ApiErrorResponse,
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
  RegisterPushToken,
  LightningAddressSuggestionsPayload,
  LightningAddressSuggestionsResponse,
  UpdateLnAddressPayload,
  UploadUrlResponse,
  ReportJobStatusPayload,
  DefaultSuccessPayload,
  SubmitInvoicePayload,
  RegisterPayload,
  SendEmailVerificationPayload,
  VerifyEmailPayload,
  EmailVerificationResponse,
} from "~/types/serverTypes";
import logger from "~/lib/log";
import { nativeGet, nativePost } from "noah-tools";

const log = logger("serverApi");

const API_URL = getServerEndpoint();
const SERVER_AUTH_KEY_INDEX = 0;

class ApiError extends Error {
  status: number;
  code: string;
  reason: string;

  constructor(message: string, status: number, code: string, reason: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.status === "string" &&
    typeof obj.code === "string" &&
    typeof obj.message === "string" &&
    typeof obj.reason === "string"
  );
};

const buildApiError = (status: number, body?: string | null): Error => {
  if (!body) {
    return new Error(`HTTP ${status}: Empty response body`);
  }

  const parseResult = Result.fromThrowable(
    () => JSON.parse(body) as unknown,
    (e) => e as Error,
  )();

  if (parseResult.isOk() && isApiErrorResponse(parseResult.value)) {
    const parsed = parseResult.value;
    return new ApiError(parsed.message, status, parsed.code, parsed.reason);
  }

  return new Error(`HTTP ${status}: ${body}`);
};

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
      const k1 = payload.k1 ?? (await getK1()).unwrapOr(undefined);

      if (!k1) {
        return err(new Error("Failed to get k1 for authentication"));
      }

      const mnemonicResult = await getMnemonic();
      if (mnemonicResult.isErr()) {
        log.w("Failed to read mnemonic for server authentication", [mnemonicResult.error]);
        return err(mnemonicResult.error);
      }

      const mnemonic = mnemonicResult.value;

      const keypairResult = await deriveKeypairFromMnemonic(
        mnemonic,
        APP_VARIANT,
        SERVER_AUTH_KEY_INDEX,
      );

      if (keypairResult.isErr()) {
        log.w("Failed to derive public key for authentication", [keypairResult.error]);
        return err(keypairResult.error);
      }
      const { public_key: key } = keypairResult.value;

      const signatureResult = await signMesssageWithMnemonic(
        k1,
        mnemonic,
        APP_VARIANT,
        SERVER_AUTH_KEY_INDEX,
      );

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
      return err(buildApiError(response.status, response.body));
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

export const getLightningAddressSuggestions = (payload: LightningAddressSuggestionsPayload) =>
  post<LightningAddressSuggestionsPayload, LightningAddressSuggestionsResponse>(
    "/ln_address_suggestions",
    payload,
    false,
  );

export const registerPushToken = (payload: RegisterPushToken) =>
  post<RegisterPushToken, DefaultSuccessPayload>("/register_push_token", payload);

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

export const sendVerificationEmail = (payload: SendEmailVerificationPayload) =>
  post<SendEmailVerificationPayload, EmailVerificationResponse>(
    "/email/send_verification",
    payload,
  );

export const verifyEmail = (payload: VerifyEmailPayload) =>
  post<VerifyEmailPayload, EmailVerificationResponse>("/email/verify", payload);

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
    return err(buildApiError(response.status, response.body));
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

    const body = JSON.stringify(restPayload);
    const responseResult = await ResultAsync.fromPromise(
      nativePost(`${API_URL}/v0/backup/download_url`, body, headers, 30),
      (e) => e as Error,
    );

    if (responseResult.isErr()) {
      return err(responseResult.error);
    }

    const response = responseResult.value;

    if (response.status < 200 || response.status >= 300) {
      return err(buildApiError(response.status, response.body));
    }

    if (!response.body) {
      return err(new Error("Empty response body from backup download_url"));
    }

    const parseResult = Result.fromThrowable(
      () => JSON.parse(response.body) as DownloadUrlResponse,
      (e) => new Error(`Failed to parse JSON response: ${(e as Error).message}`),
    )();

    if (parseResult.isErr()) {
      return err(parseResult.error);
    }

    return ok(parseResult.value);
  } catch (e) {
    return err(e as Error);
  }
};

export const deregister = () => post<object, DefaultSuccessPayload>("/deregister", {});

export const reportLastLogin = () => post<object, DefaultSuccessPayload>("/report_last_login", {});

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
    return err(buildApiError(response.status, response.body));
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
