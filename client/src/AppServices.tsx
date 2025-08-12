import { memo } from "react";
import { useSyncManager } from "~/hooks/useSyncManager";
import { useServerRegistration } from "~/hooks/useServerRegistration";

const AppServices = memo(() => {
  console.log("AppServices rendered");
  // Initialize all app-level services here
  useSyncManager(30_000);
  useServerRegistration();

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
