import { useEffect } from "react";
import { useServerStore } from "~/store/serverStore";
import { getServerEndpoint } from "~/constants";
import { lnurlAuth } from "~/lib/lnurlAuth";
import logger from "~/lib/log";

const log = logger("useServerRegistration");

export const useServerRegistration = () => {
  const { isRegisteredWithServer, setRegisteredWithServer } = useServerStore();

  useEffect(() => {
    const register = async () => {
      if (isRegisteredWithServer) {
        log.d("Already registered with server");
        return;
      }

      try {
        const serverEndpoint = getServerEndpoint();
        const getK1Url = `${serverEndpoint}/getK1`;
        const response = await fetch(getK1Url);
        const { k1, tag } = await response.json();

        if (tag !== "login") {
          throw new Error("Invalid tag from server");
        }

        const lnurl = `${serverEndpoint}/register?k1=${k1}&tag=login`;
        const success = await lnurlAuth(lnurl);

        if (success) {
          log.d("Successfully registered with server");
          setRegisteredWithServer(true);
        }
      } catch (error) {
        log.w("Failed to register with server", [error]);
      }
    };

    register();
  }, [isRegisteredWithServer, setRegisteredWithServer]);
};
