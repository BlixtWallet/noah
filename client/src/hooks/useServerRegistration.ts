import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair } from "~/lib/paymentsApi";
import { signMessage } from "~/lib/walletApi";
import logger from "~/lib/log";
import { ResultAsync } from "neverthrow";

const log = logger("useServerRegistration");

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer, setRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer) {
        return;
      }

      const serverEndpoint = getServerEndpoint();
      const getK1Url = `${serverEndpoint}/v0/getk1`;

      const k1Result = await ResultAsync.fromPromise(
        fetch(getK1Url).then((res) => res.json()),
        (e) => e as Error,
      );

      if (k1Result.isErr()) {
        log.w("Failed to get k1 from server", [k1Result.error]);
        return;
      }

      const { k1, tag } = k1Result.value;

      if (tag !== "login") {
        log.w("Invalid tag from server");
        return;
      }

      const index = 0;
      const peakResult = await peakKeyPair(index);
      if (peakResult.isErr()) {
        log.w("Failed to peak key pair", [peakResult.error]);
        return;
      }
      const { public_key: key } = peakResult.value;

      const sigResult = await signMessage(k1, index);
      if (sigResult.isErr()) {
        log.w("Failed to sign message", [sigResult.error]);
        return;
      }
      const sig = sigResult.value;

      const registerUrl = `${serverEndpoint}/v0/register`;
      const registerResponseResult = await ResultAsync.fromPromise(
        fetch(registerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            k1,
            sig,
            key,
          }),
        }),
        (e) => e as Error,
      );

      if (registerResponseResult.isErr()) {
        log.w("Failed to register with server", [registerResponseResult.error]);
        return;
      }

      const registerResponse = registerResponseResult.value;

      if (registerResponse.ok) {
        const { lightning_address } = await registerResponse.json();
        log.d("Successfully registered with server");
        setRegisteredWithServer(true, lightning_address);
      } else {
        const errorBody = await registerResponse.text();
        log.w("Failed to register with server", [registerResponse.status, errorBody]);
      }
    };

    register();
  }, [isRegisteredWithServer, setRegisteredWithServer, isReady]);
};
