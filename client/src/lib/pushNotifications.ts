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
import { NotificationsData, ReportType } from "~/types/serverTypes";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
async function handleTaskCompletion(
  report_type: ReportType,
  result: Result<void, Error>,
  k1?: string,
) {
  if (result.isErr()) {
    log.d(`Failed to trigger ${report_type} task, reporting failure`);
    const jobStatusResult = await reportJobStatus({
      report_type,
      status: "failure",
      error_message: result.error.message,
      k1,
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
    k1,
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
        const rawBody = (data as { data?: { body?: unknown } })?.data?.body;
        if (typeof rawBody === "string") {
          return JSON.parse(rawBody) as NotificationsData;
        }
        return rawBody as NotificationsData;
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

    if (!notificationData || !notificationData.notification_type) {
      log.w("[Background Job] No data or type received", [notificationData]);
      return;
    }

    const taskResult = await ResultAsync.fromPromise(
      (async () => {
        if (notificationData.notification_type === "background_sync") {
          await backgroundSync();
        } else if (notificationData.notification_type === "maintenance") {
          if (!notificationData.k1) {
            log.w("Invalid maintenance notification", [notificationData]);
            return;
          }
          const result = await maintenance();
          await handleTaskCompletion("maintenance", result, notificationData.k1);
        } else if (notificationData.notification_type === "lightning_invoice_request") {
          log.d("Received lightning invoice request", [notificationData]);
          if (!notificationData.amount || !notificationData.k1) {
            log.w("Invalid lightning invoice request", [notificationData]);
            return;
          }

          await submitInvoice(notificationData.k1, notificationData.amount);
        } else if (notificationData.notification_type === "backup_trigger") {
          if (!notificationData.k1) {
            log.w("Invalid backup trigger notification", [notificationData]);
            return;
          }
          const result = await triggerBackupTask();
          await handleTaskCompletion("backup", result, notificationData.k1);
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
