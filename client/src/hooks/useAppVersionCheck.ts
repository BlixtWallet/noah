import { useQuery } from "@tanstack/react-query";
import { checkAppVersion } from "~/lib/api";
import Constants from "expo-constants";
import logger from "~/lib/log";

const log = logger("useAppVersionCheck");

export const useAppVersionCheck = () => {
  const clientVersion = Constants.expoConfig?.version || "0.0.1";

  const { data, isLoading } = useQuery({
    queryKey: ["appVersion", clientVersion],
    queryFn: async () => {
      log.d("Checking app version", [clientVersion]);

      const result = await checkAppVersion(clientVersion);

      if (result.isErr()) {
        log.w("Failed to check app version, allowing app to continue", [result.error]);
        return {
          update_required: false,
          minimum_required_version: "0.0.1",
        };
      }

      const { update_required, minimum_required_version } = result.value;

      log.d("Version check result", [
        `update_required: ${update_required}`,
        `minimum_version: ${minimum_required_version}`,
      ]);

      return result.value;
    },
    staleTime: Infinity,
    retry: false,
  });

  return {
    isUpdateRequired: data?.update_required ?? false,
    isChecking: isLoading,
    minimumVersion: data?.minimum_required_version ?? null,
    currentVersion: clientVersion,
  };
};
