import { memo } from "react";
import { useSyncManager } from "~/hooks/useSyncManager";

const AppServices = memo(() => {
  console.log("AppServices rendered");
  // Initialize all app-level services here
  useSyncManager(30_000);

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
