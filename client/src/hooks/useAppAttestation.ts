import { Platform } from "react-native";
import { Result, ok, err } from "neverthrow";
import {
  isHardwareBackedKeyGenerationSupportedIos,
  generateKeyIos,
  attestKeyIos,
} from "react-native-secure-enclave-operations";
import { getK1 } from "~/lib/api";
import logger from "~/lib/log";
import { IosAttestationPayload } from "~/types/serverTypes";

const log = logger("useAppAttestation");

export type AttestationResult = {
  ios_attestation: IosAttestationPayload | null;
};

export const performIosAttestation = async (): Promise<Result<AttestationResult, Error>> => {
  if (Platform.OS !== "ios") {
    log.d("Skipping iOS attestation on non-iOS platform");
    return ok({ ios_attestation: null });
  }

  try {
    const isSupported = await isHardwareBackedKeyGenerationSupportedIos();
    if (!isSupported) {
      log.w("Device does not support hardware-backed key generation");
      return ok({ ios_attestation: null });
    }

    const keyId = await generateKeyIos();
    log.d("Generated attestation key", [keyId]);

    const k1Result = await getK1();
    if (k1Result.isErr()) {
      log.w("Failed to get challenge for attestation", [k1Result.error]);
      return ok({ ios_attestation: null });
    }
    const challenge = k1Result.value;

    const attestation = await attestKeyIos(keyId, challenge);
    log.d("Successfully attested key");

    return ok({
      ios_attestation: {
        attestation,
        challenge,
        key_id: keyId,
      },
    });
  } catch (error) {
    log.w("iOS attestation failed", [error]);
    return ok({ ios_attestation: null });
  }
};
