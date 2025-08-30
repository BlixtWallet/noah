import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { PLATFORM } from "~/constants";
import logger from "~/lib/log";
import { captureException } from "@sentry/react-native";
import { backgroundSync, maintenance, submitInvoice, triggerBackupTask } from "./tasks";
import { registerPushToken, reportJobStatus } from "~/lib/api";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { ReportType } from "~/types/serverTypes";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
async function handleTaskCompletion(report_type: ReportType, result: Result<void, Error>) {
  if (result.isErr()) {
    log.d(`Failed to trigger ${report_type} task, reporting failure`);
    const jobStatusResult = await reportJobStatus({
      report_type,
      status: "failure",
      error_message: result.error.message,
    });

    if (jobStatusResult.isErr()) {
      log.d("Failed to report job status", [jobStatusResult.error]);
    }
    throw result.error;
  }

  log.d(`Triggered ${report_type} task, reporting success`);
  const jobStatusResult = await reportJobStatus({
    report_type,
    status: "success",
    error_message: null,
  });

  if (jobStatusResult.isErr()) {
    log.d("Failed to report job status", [jobStatusResult.error]);
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error, executionInfo }) => {
    log.d("[Background Job] dataReceived", [data, typeof data]);
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
          const result = await maintenance();
          await handleTaskCompletion("maintenance", result);
        } else if (notificationData.type === "lightning-invoice-request") {
          log.d("Received lightning invoice request", [notificationData]);
          const amountMsat = parseInt(notificationData.amount);
          await submitInvoice(notificationData.request_id, amountMsat);
        } else if (notificationData.type === "backup-trigger") {
          const result = await triggerBackupTask();
          await handleTaskCompletion("backup", result);
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
  const result = await registerPushToken({ push_token: pushToken });

  if (result.isErr()) {
    return err(result.error);
  }

  return ok(undefined);
}
