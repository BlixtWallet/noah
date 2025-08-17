import { err, ok, Result, ResultAsync } from "neverthrow";
import logger from "~/lib/log";
import { signMessage } from "./walletApi";
import { peakKeyPair } from "./paymentsApi";

const log = logger("lnurlAuth");

export interface ILNUrlPayResponseError {
  status: "ERROR";
  reason: string;
}

export interface ILNUrlAuthResponse {
  status: "OK" | "ERROR";
  event?: "REGISTERED" | "LOGGEDIN" | "LINKED" | "AUTHED";
  reason?: string;
}

export interface ILNUrlError {
  status: "ERROR";
  reason: string;
}

export interface ILNUrlAuthRequest {
  tag: "login";
  k1: string;
}

export const lnurlAuth = async (lnUrlStr: string): Promise<Result<boolean, Error>> => {
  // 0. Decode the LNURL
  const lnUrlObject = new URL(lnUrlStr);

  // Get the tag and k1
  const tag = lnUrlObject.searchParams.get("tag");
  const k1 = lnUrlObject.searchParams.get("k1");
  const action = lnUrlObject.searchParams.get("action");

  if (!tag || !k1) {
    return err(new Error("Invalid LNURLAuth request"));
  }

  const index = 0;
  const keyPairResult = await peakKeyPair(index);
  if (keyPairResult.isErr()) {
    return err(keyPairResult.error);
  }
  const { public_key: pubkey } = keyPairResult.value;

  const signatureResult = await signMessage(k1, index);
  if (signatureResult.isErr()) {
    return err(signatureResult.error);
  }
  const signature = signatureResult.value;

  const url = new URL(lnUrlStr);
  url.searchParams.append("sig", signature);
  url.searchParams.append("key", pubkey);
  if (action) {
    url.searchParams.append("action", action);
  }

  const finalUrl = url.toString();
  log.d("Fetching URL:", [finalUrl]);

  return ResultAsync.fromPromise(fetch(finalUrl), (e) => e as Error)
    .andThen((response) => {
      log.d("result", [JSON.stringify(response)]);
      return ResultAsync.fromPromise(
        response.json() as Promise<ILNUrlAuthResponse | ILNUrlError>,
        (e) => e as Error,
      );
    })
    .andThen((response) => {
      log.d("response", [response]);
      if (isLNUrlPayResponseError(response)) {
        return err(new Error(response.reason));
      }
      return ok(true);
    });
};

const isLNUrlPayResponseError = (subject: any): subject is ILNUrlPayResponseError => {
  return typeof subject === "object" && subject.status && subject.status === "ERROR";
};
