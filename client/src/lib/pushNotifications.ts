import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { PLATFORM } from "~/constants";

import { syncWallet } from "~/lib/sync";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error, executionInfo }) => {
    try {
      console.log("[Background Job] data", data);
      console.log("[Background Job] error", error);
      console.log("[Background Job] executionInfo", executionInfo);

      console.log("[Background Job] Received a notification task payload!");
      const isNotificationResponse = "actionIdentifier" in data;

      if (data && (data as any).data.body === "{}") {
        console.log("[Background Job] data.data.body === '{}'");
        return;
      }

      if (isNotificationResponse) {
        // Do something with the notification response from user
        console.log("[Background Job] user pressed notification");
      } else {
        // Do something with the data from notification that was received
        console.log("[Background Job] data notification");
        await syncWallet();
      }
    } catch (e) {
      console.error("[Background Job] error", e);
    }
  },
);

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function handleRegistrationError(errorMessage: string) {
  alert(errorMessage);
  throw new Error(errorMessage);
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    console.log("Device is device");
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log("existingStatus", existingStatus);
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log("status", status);
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      handleRegistrationError("Permission not granted to get push token for push notification!");
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      handleRegistrationError("Project ID not found");
    }
    try {
      const nativePushToken = await Notifications.getDevicePushTokenAsync();
      console.log(PLATFORM === "android" ? "fcm" : "apns", nativePushToken);

      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log(pushTokenString);
      return pushTokenString;
    } catch (e: unknown) {
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError("Must use physical device for push notifications");
  }
}
