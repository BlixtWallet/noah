import {
  signMessage as signMessageNitro,
  peakKeyPair as peakKeyPairNitro,
  deriveStoreNextKeypair as deriveStoreNextKeypairNitro,
  type KeyPairResult,
} from "react-native-nitro-ark";
import { Result, ok, err, ResultAsync } from "neverthrow";
import * as Keychain from "react-native-keychain";
import { APP_VARIANT } from "~/config";
import { KEYCHAIN_USERNAME } from "~/constants";

const MNEMONIC_KEYCHAIN_SERVICE = `com.noah.mnemonic.${APP_VARIANT}`;

export const signMessage = async (
  message: string,
  index: number,
): Promise<Result<string, Error>> => {
  return ResultAsync.fromPromise(signMessageNitro(message, index), (e) => e as Error);
};

export const peakKeyPair = async (index: number): Promise<Result<KeyPairResult, Error>> => {
  return ResultAsync.fromPromise(peakKeyPairNitro(index), (e) => e as Error);
};

export const deriveStoreNextKeypair = async (): Promise<Result<KeyPairResult, Error>> => {
  return ResultAsync.fromPromise(deriveStoreNextKeypairNitro(), (e) => e as Error);
};

export const setMnemonic = async (mnemonic: string): Promise<Result<void, Error>> => {
  await ResultAsync.fromPromise(
    Keychain.setGenericPassword(KEYCHAIN_USERNAME, mnemonic, {
      service: MNEMONIC_KEYCHAIN_SERVICE,
    }),
    (e) => e as Error,
  );

  return ok(undefined);
};

export const getMnemonic = async (): Promise<Result<string, Error>> => {
  const credentialsResult = await ResultAsync.fromPromise(
    Keychain.getGenericPassword({ service: MNEMONIC_KEYCHAIN_SERVICE }),
    (e) => e as Error,
  );

  if (credentialsResult.isErr()) {
    return err(credentialsResult.error);
  }

  const credentials = credentialsResult.value;
  if (!credentials || !credentials.password) {
    return err(new Error("No wallet found. Please create a wallet first."));
  }

  return ok(credentials.password);
};
