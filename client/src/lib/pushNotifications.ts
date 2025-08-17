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
import { err, ok, Result } from "neverthrow";

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

      log.d("[Background Job] dataReceived", [data, typeof data]);

      let notificationData = (data as any)?.data?.body;

      if (typeof notificationData === "string") {
        notificationData = JSON.parse(notificationData);
      }

      log.d("[Background Job] notificationData", [notificationData, typeof notificationData]);

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

export async function registerForPushNotificationsAsync(): Promise<Result<string, Error>> {
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
      return err(new Error("Permission not granted to get push token for push notification!"));
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      return err(new Error("Project ID not found"));
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
      return ok(pushTokenString);
    } catch (e: unknown) {
      return err(new Error(`${e}`));
    }
  } else {
    return err(new Error("Must use physical device for push notifications"));
  }
}

export async function registerPushTokenWithServer(pushToken: string): Promise<Result<void, Error>> {
  try {
    const serverEndpoint = getServerEndpoint();
    const getK1Url = `${serverEndpoint}/v0/getk1`;
    const response = await fetch(getK1Url);
    const { k1, tag } = await response.json();

    if (tag !== "login") {
      return err(new Error("Invalid tag from server"));
    }

    const index = 0;
    const keyPairResult = await peakKeyPair(index);
    if (keyPairResult.isErr()) {
      return err(keyPairResult.error);
    }
    const { public_key: key } = keyPairResult.value;

    const signatureResult = await signMessage(k1, index);
    if (signatureResult.isErr()) {
      return err(signatureResult.error);
    }
    const signature = signatureResult.value;

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
      return err(
        new Error(`Failed to register push token: ${registrationResponse.status} ${errorBody}`),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
