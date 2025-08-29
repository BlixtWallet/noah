import { memo, useEffect, useState } from "react";
import { useSyncManager } from "~/hooks/useSyncManager";
import { useServerRegistration } from "~/hooks/useServerRegistration";
import { usePushNotifications } from "~/hooks/usePushNotifications";
import { useTransactionStore } from "~/store/transactionStore";

const AppServices = memo(() => {
  const [isReady, setIsReady] = useState(false);

  // Initialize all app-level services here
  useSyncManager(30_000);
  useServerRegistration(isReady);
  usePushNotifications(isReady);

  useEffect(() => {
    setIsReady(true);
    useTransactionStore.getState().loadTransactions();
  }, []);

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
