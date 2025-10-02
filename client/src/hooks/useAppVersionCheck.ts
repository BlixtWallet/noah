import { useEffect, useState } from "react";
import { checkAppVersion } from "~/lib/api";
import Constants from "expo-constants";
import logger from "~/lib/log";

const log = logger("useAppVersionCheck");

export const useAppVersionCheck = () => {
  const [isUpdateRequired, setIsUpdateRequired] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [minimumVersion, setMinimumVersion] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      const clientVersion = Constants.expoConfig?.version || "0.0.1";

      log.d("Checking app version", [clientVersion]);

      const result = await checkAppVersion(clientVersion);

      if (result.isErr()) {
        log.w("Failed to check app version, allowing app to continue", [result.error]);
        setIsChecking(false);
        return;
      }

      const { update_required, minimum_required_version } = result.value;

      log.d("Version check result", [
        `update_required: ${update_required}`,
        `minimum_version: ${minimum_required_version}`,
      ]);

      setIsUpdateRequired(update_required);
      setMinimumVersion(minimum_required_version);
      setIsChecking(false);
    };

    checkVersion();
  }, []);

  return {
    isUpdateRequired,
    isChecking,
    minimumVersion,
    currentVersion: Constants.expoConfig?.version || "0.0.1",
  };
};
