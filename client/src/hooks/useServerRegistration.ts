import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { getServerEndpoint } from "~/constants";
import { peakKeyPair } from "~/lib/paymentsApi";
import { signMessage } from "~/lib/walletApi";
import logger from "~/lib/log";

const log = logger("useServerRegistration");

export const useServerRegistration = (isReady: boolean) => {
  const { isRegisteredWithServer, setRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (!isReady || isRegisteredWithServer) {
        return;
      }

      try {
        const serverEndpoint = getServerEndpoint();
        const getK1Url = `${serverEndpoint}/v0/getk1`;
        const response = await fetch(getK1Url);
        const { k1, tag } = await response.json();

        if (tag !== "login") {
          log.w("Invalid tag from server");
          return;
        }

        const index = 0;
        const { public_key: key } = await peakKeyPair(index);
        const sig = await signMessage(k1, index);

        const registerUrl = `${serverEndpoint}/v0/register`;
        const registerResponse = await fetch(registerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            k1,
            sig,
            key,
          }),
        });

        if (registerResponse.ok) {
          log.d("Successfully registered with server");
          setRegisteredWithServer(true);
        } else {
          const errorBody = await registerResponse.text();
          log.w("Failed to register with server", [registerResponse.status, errorBody]);
        }
      } catch (error) {
        log.w("Failed to register with server", [error]);
      }
    };

    register();
  }, [isRegisteredWithServer, setRegisteredWithServer, isReady]);
};
