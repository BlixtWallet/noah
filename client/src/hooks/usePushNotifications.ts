import { useEffect } from "react";
import { registerForPushNotificationsAsync } from "~/lib/pushNotifications";

export function usePushNotifications() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);
}
