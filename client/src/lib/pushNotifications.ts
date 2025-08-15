import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { PLATFORM, getServerEndpoint } from "~/constants";
import logger from "~/lib/log";
import { captureException } from "@sentry/react-native";
import { backgroundSync, maintenance, submitInvoice } from "./tasks";
import { peakKeyPair } from "./paymentsApi";
import { signMessage } from "./walletApi";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error, executionInfo }) => {
    try {
      if (error) {
        log.e("[Background Job] error", [error]);
        captureException(error);
        return;
      }

      const notificationData = (data as any)?.data?.body;

      log.d("[Background Job] notificationData", [notificationData]);

      if (!notificationData || !notificationData.type) {
        log.w("[Background Job] No data or type received", [notificationData]);
        return;
      }

      if (notificationData.type === "background-sync") {
        await backgroundSync();
      } else if (notificationData.type === "maintenance") {
        await maintenance();
      } else if (notificationData.type === "lightning-invoice-request") {
        log.d("Received lightning invoice request", [notificationData]);
        // TODO: Prompt user to generate and submit invoice for the given amount
        const amountMsat = parseInt(notificationData.amount);
        log.d(`Request for ${amountMsat} msats`);
        // This is where you would generate a real invoice
        await submitInvoice(notificationData.request_id, amountMsat);
      }
    } catch (e) {
      captureException(
        new Error(
          `Failed to handle background notification: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
      log.e("[Background Job] error", [e]);
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
    log.v("Device is device");
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    log.v("existingStatus", [existingStatus]);
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      log.d("status", [status]);
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
      log.d(PLATFORM === "android" ? "fcm" : "apns", [nativePushToken]);

      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      log.d("push token string is ", [pushTokenString]);
      return pushTokenString;
    } catch (e: unknown) {
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError("Must use physical device for push notifications");
  }
}

export async function registerPushTokenWithServer(pushToken: string) {
  const serverEndpoint = getServerEndpoint();
  const getK1Url = `${serverEndpoint}/v0/getk1`;
  const response = await fetch(getK1Url);
  const { k1, tag } = await response.json();

  if (tag !== "login") {
    throw new Error("Invalid tag from server");
  }

  const index = 0;
  const { public_key: key } = await peakKeyPair(index);
  const signature = await signMessage(k1, index);

  const registerUrl = `${serverEndpoint}/v0/register_push_token`;
  const registrationResponse = await fetch(registerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      push_token: pushToken,
      key,
      sig: signature,
      k1,
    }),
  });

  if (!registrationResponse.ok) {
    const errorBody = await registrationResponse.text();
    throw new Error(`Failed to register push token: ${registrationResponse.status} ${errorBody}`);
  }
}
