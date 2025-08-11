import logger from "~/lib/log";
import { signMessage } from "./walletApi";
import { createHash } from "react-native-quick-crypto/lib/typescript/src/Hash";
import { createHmac } from "react-native-quick-crypto/lib/typescript/src/Hmac";
import secp256k1 from "secp256k1";
import { hexToUint8Array, bytesToHexString, getDomainFromURL } from "~/constants";

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

  if (!tag || !k1) {
    throw new Error("Invalid LNURLAuth request");
  }

  // 1. The following canonical phrase is defined: [...].
  const LNURLAUTH_CANONICAL_PHRASE =
    "DO NOT EVER SIGN THIS TEXT WITH YOUR PRIVATE KEYS! IT IS ONLY USED FOR DERIVATION OF LNURL-AUTH HASHING-KEY, DISCLOSING ITS SIGNATURE WILL COMPROMISE YOUR LNURL-AUTH IDENTITY AND MAY LEAD TO LOSS OF FUNDS!";

  const index = 0;

  // 2. LN WALLET obtains an RFC6979 deterministic signature of sha256(utf8ToBytes(canonical phrase)) using secp256k1 with node private key.
  const signature = await signMessage(LNURLAUTH_CANONICAL_PHRASE, index);

  // 3. LN WALLET defines hashingKey as PrivateKey(sha256(obtained signature)).
  const hashingKey = createHash("sha256").update(signature).digest();
  // 4. SERVICE domain name is extracted from auth LNURL and then service-specific linkingPrivKey is defined as PrivateKey(hmacSha256(hashingKey, service domain name)).
  const domain = getDomainFromURL(lnUrlStr);
  const linkingKeyPriv = createHmac("sha256", hashingKey).update(domain).digest();

  // Obtain the public key
  const linkingKeyPub = secp256k1.publicKeyCreate(linkingKeyPriv, true);

  // Sign the message
  const signedMessage = secp256k1.ecdsaSign(hexToUint8Array(k1), linkingKeyPriv);
  const signedMessageDER = secp256k1.signatureExport(signedMessage.signature);

  //    LN WALLET Then issues a GET to LN SERVICE using
  //    <LNURL_hostname_and_path>?<LNURL_existing_query_parameters>&sig=<hex(sign(k1.toByteArray, linkingPrivKey))>&key=<hex(linkingKey)>
  const url =
    lnUrlStr +
    `&sig=${bytesToHexString(signedMessageDER)}` +
    `&key=${bytesToHexString(linkingKeyPub)}`;
  log.d("url", [url]);
  // 4 omitted
  const result = await fetch(url);
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
