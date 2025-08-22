import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { PLATFORM, getServerEndpoint } from "~/constants";
import logger from "~/lib/log";
import { captureException } from "@sentry/react-native";
import { backgroundSync, maintenance, submitInvoice, triggerBackup } from "./tasks";
import { peakKeyPair } from "./paymentsApi";
import { signMessage } from "./walletApi";
import { err, ok, Result, ResultAsync } from "neverthrow";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error, executionInfo }) => {
    if (error) {
      log.e("[Background Job] error", [error]);
      captureException(error);
      return;
    }

    log.d("[Background Job] dataReceived", [data, typeof data]);

    const notificationDataResult = Result.fromThrowable(
      () => {
        let notificationData = (data as any)?.data?.body;
        if (typeof notificationData === "string") {
          return JSON.parse(notificationData);
        }
        return notificationData;
      },
      (e) => new Error(`Failed to parse notification data: ${e}`),
    )();

    if (notificationDataResult.isErr()) {
      captureException(notificationDataResult.error);
      log.e("[Background Job] error", [notificationDataResult.error]);
      return;
    }

    const notificationData = notificationDataResult.value;

    log.d("[Background Job] notificationData", [notificationData, typeof notificationData]);

    if (!notificationData || !notificationData.type) {
      log.w("[Background Job] No data or type received", [notificationData]);
      return;
    }

    const taskResult = await ResultAsync.fromPromise(
      (async () => {
        if (notificationData.type === "background-sync") {
          await backgroundSync();
        } else if (notificationData.type === "maintenance") {
          await maintenance();
        } else if (notificationData.type === "lightning-invoice-request") {
          log.d("Received lightning invoice request", [notificationData]);
          const amountMsat = parseInt(notificationData.amount);
          await submitInvoice(notificationData.request_id, amountMsat);
        } else if (notificationData.type === "backup_trigger") {
          await triggerBackup();
        }
      })(),
      (e) =>
        new Error(
          `Failed to handle background notification: ${e instanceof Error ? e.message : String(e)}`,
        ),
    );

    if (taskResult.isErr()) {
      captureException(taskResult.error);
      log.e("[Background Job] error", [taskResult.error]);
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
    const nativePushTokenResult = await ResultAsync.fromPromise(
      Notifications.getDevicePushTokenAsync(),
      (e) => e as Error,
    );

    if (nativePushTokenResult.isErr()) {
      return err(nativePushTokenResult.error);
    }

    const nativePushToken = nativePushTokenResult.value;
    log.d(PLATFORM === "android" ? "fcm" : "apns", [nativePushToken]);

    const pushTokenResult = await ResultAsync.fromPromise(
      Notifications.getExpoPushTokenAsync({
        projectId,
      }),
      (e) => e as Error,
    );

    if (pushTokenResult.isErr()) {
      return err(pushTokenResult.error);
    }

    const pushTokenString = pushTokenResult.value.data;
    log.d("push token string is ", [pushTokenString]);
    return ok(pushTokenString);
  } else {
    return err(new Error("Must use physical device for push notifications"));
  }
}

export async function registerPushTokenWithServer(pushToken: string): Promise<Result<void, Error>> {
  const serverEndpoint = getServerEndpoint();
  const getK1Url = `${serverEndpoint}/v0/getk1`;

  const k1Result = await ResultAsync.fromPromise(
    fetch(getK1Url).then((res) => res.json()),
    (e) => e as Error,
  );

  if (k1Result.isErr()) {
    return err(k1Result.error);
  }

  const { k1, tag } = k1Result.value as { k1: string; tag: string };

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
  const registrationResponseResult = await ResultAsync.fromPromise(
    fetch(registerUrl, {
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
    }),
    (e) => e as Error,
  );

  if (registrationResponseResult.isErr()) {
    return err(registrationResponseResult.error);
  }

  const registrationResponse = registrationResponseResult.value;

  if (!registrationResponse.ok) {
    const errorBody = await registrationResponse.text();
    return err(
      new Error(`Failed to register push token: ${registrationResponse.status} ${errorBody}`),
    );
  }
  return ok(undefined);
}
