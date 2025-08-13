import { memo } from "react";
import { useSyncManager } from "~/hooks/useSyncManager";
import { useServerRegistration } from "~/hooks/useServerRegistration";
import { usePushNotifications } from "~/hooks/usePushNotifications";

const AppServices = memo(() => {
  // Initialize all app-level services here
  useSyncManager(30_000);
  useServerRegistration();
  usePushNotifications();

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
