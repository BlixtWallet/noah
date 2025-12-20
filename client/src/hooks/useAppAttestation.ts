import { Platform } from "react-native";
import { Result, ok } from "neverthrow";
import {
  isHardwareBackedKeyGenerationSupportedIos,
  generateKeyIos,
  attestKeyIos,
  isPlayServicesAvailableAndroid,
  prepareIntegrityTokenAndroid,
  requestIntegrityTokenAndroid,
} from "react-native-secure-enclave-operations";
import { getK1 } from "~/lib/api";
import logger from "~/lib/log";
import { IosAttestationPayload, AndroidAttestationPayload } from "~/types/serverTypes";
import Constants from "expo-constants";

const log = logger("useAppAttestation");

export type AttestationResult = {
  ios_attestation: IosAttestationPayload | null;
  android_attestation: AndroidAttestationPayload | null;
};

const GOOGLE_CLOUD_PROJECT_NUMBER = Constants.expoConfig?.extra?.googleCloudProjectNumber as
  | string
  | undefined;

export const performIosAttestation = async (): Promise<IosAttestationPayload | null> => {
  try {
    const isSupported = await isHardwareBackedKeyGenerationSupportedIos();
    if (!isSupported) {
      log.w("Device does not support hardware-backed key generation");
      return null;
    }

    const keyId = await generateKeyIos();
    log.d("Generated iOS attestation key");

    const k1Result = await getK1();
    if (k1Result.isErr()) {
      log.w("Failed to get challenge for iOS attestation", [k1Result.error]);
      return null;
    }
    const challenge = k1Result.value;

    const attestation = await attestKeyIos(keyId, challenge);
    log.d("Successfully attested iOS key");

    return {
      attestation,
      challenge,
      key_id: keyId,
    };
  } catch (error) {
    log.w("iOS attestation failed", [error]);
    return null;
  }
};

export const performAndroidAttestation = async (): Promise<AndroidAttestationPayload | null> => {
  try {
    if (!GOOGLE_CLOUD_PROJECT_NUMBER) {
      log.w("Google Cloud Project Number not configured, skipping Android attestation");
      return null;
    }

    const isAvailable = await isPlayServicesAvailableAndroid();
    if (!isAvailable) {
      log.w("Google Play Services not available");
      return null;
    }

    await prepareIntegrityTokenAndroid(GOOGLE_CLOUD_PROJECT_NUMBER);
    log.d("Prepared Android integrity token provider");

    const k1Result = await getK1();
    if (k1Result.isErr()) {
      log.w("Failed to get challenge for Android attestation", [k1Result.error]);
      return null;
    }
    const challenge = k1Result.value;

    const integrityToken = await requestIntegrityTokenAndroid(challenge);
    log.d("Successfully obtained Android integrity token");

    return {
      integrity_token: integrityToken,
      challenge,
    };
  } catch (error) {
    log.w("Android attestation failed", [error]);
    return null;
  }
};

export const performAttestation = async (): Promise<Result<AttestationResult, Error>> => {
  if (Platform.OS === "ios") {
    const ios_attestation = await performIosAttestation();
    return ok({ ios_attestation, android_attestation: null });
  }

  if (Platform.OS === "android") {
    const android_attestation = await performAndroidAttestation();
    return ok({ ios_attestation: null, android_attestation });
  }

  log.d("Skipping attestation on unsupported platform");
  return ok({ ios_attestation: null, android_attestation: null });
};
