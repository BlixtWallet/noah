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

export const lnurlAuth = async (lnUrlStr: string) => {
  // 0. Decode the LNURL
  const lnUrlObject = new URL(lnUrlStr);

  // Get the tag and k1
  const tag = lnUrlObject.searchParams.get("tag");
  const k1 = lnUrlObject.searchParams.get("k1");
  const action = lnUrlObject.searchParams.get("action");

  if (!tag || !k1) {
    throw new Error("Invalid LNURLAuth request");
  }

  const index = 0;
  const { public_key: pubkey } = await peakKeyPair(index);
  const signature = await signMessage(k1, index);

  const url = new URL(lnUrlStr);
  url.searchParams.append("sig", signature);
  url.searchParams.append("key", pubkey);
  if (action) {
    url.searchParams.append("action", action);
  }
  log.d("url", [url]);
  // 4 omitted
  const finalUrl = url.toString();
  log.d("Fetching URL:", [finalUrl]);
  const result = await fetch(finalUrl);
  log.d("result", [JSON.stringify(result)]);

  let response: ILNUrlAuthResponse | ILNUrlError;
  try {
    response = await result.json();
  } catch (e) {
    log.d("", [e]);
    throw new Error("Unable to parse message from the server");
  }
  log.d("response", [response]);

  if (isLNUrlPayResponseError(response)) {
    throw new Error(response.reason);
  }

  return true;
};

const isLNUrlPayResponseError = (subject: any): subject is ILNUrlPayResponseError => {
  return typeof subject === "object" && subject.status && subject.status === "ERROR";
};
