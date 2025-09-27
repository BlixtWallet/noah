import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import logger from "~/lib/log";
import { captureException } from "@sentry/react-native";
import {
  backgroundSync,
  maintenance,
  offboardTask,
  submitInvoice,
  triggerBackupTask,
} from "./tasks";
import { registerPushToken, reportJobStatus, heartbeatResponse } from "~/lib/api";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { NotificationData, ReportType } from "~/types/serverTypes";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
async function handleTaskCompletion(
  report_type: ReportType,
  result: Result<void, Error>,
  k1?: string,
) {
  if (result.isErr()) {
    log.w(`Failed to trigger ${report_type} task, reporting failure`);
    const jobStatusResult = await reportJobStatus({
      report_type,
      status: "failure",
      error_message: result.error.message,
      k1,
    });

    if (jobStatusResult.isErr()) {
      log.w("Failed to report job status", [jobStatusResult.error]);
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
    log.i("Failed to report job status", [jobStatusResult.error]);
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    log.i("[Background Job] dataReceived", [data, typeof data]);
    if (error) {
      log.e("[Background Job] error", [error]);
      captureException(error);
      return;
    }

    const notificationDataResult = Result.fromThrowable(
      () => {
        const rawBody = (data as { data?: { body?: unknown } })?.data?.body;
        if (typeof rawBody === "string") {
          return JSON.parse(rawBody) as NotificationData;
        }
        return rawBody as NotificationData;
      },
      (e) => new Error(`Failed to parse notification data: ${e}`),
    )();

    if (notificationDataResult.isErr()) {
      captureException(notificationDataResult.error);
      log.e("[Background Job] error", [notificationDataResult.error]);
      return;
    }

    const notificationData = notificationDataResult.value;

    if (!notificationData || !notificationData.notification_type) {
      log.w("[Background Job] No data or type received", [notificationData]);
      return;
    }

    const taskResult = await ResultAsync.fromPromise(
      (async () => {
        switch (notificationData.notification_type) {
          case "background_sync":
            await backgroundSync();
            break;

          case "maintenance": {
            const result = await maintenance();
            await handleTaskCompletion("maintenance", result, notificationData.k1);
            break;
          }

          case "lightning_invoice_request": {
            log.i("Received lightning invoice request", [notificationData]);
            await submitInvoice(
              notificationData.transaction_id,
              notificationData.k1,
              notificationData.amount,
            );
            break;
          }

          case "backup_trigger": {
            const result = await triggerBackupTask();
            await handleTaskCompletion("backup", result, notificationData.k1);
            log.d("Backup task completed");
            break;
          }

          case "offboarding": {
            const result = await offboardTask(notificationData.offboarding_request_id);
            await handleTaskCompletion("offboarding", result, notificationData.k1);
            log.d("Offboarding task completed");
            break;
          }

          case "heartbeat": {
            log.i("Received heartbeat notification", [notificationData]);
            const heartbeatResult = await heartbeatResponse({
              notification_id: notificationData.notification_id,
              k1: notificationData.k1,
            });

            if (heartbeatResult.isErr()) {
              log.w("Failed to respond to heartbeat", [heartbeatResult.error]);
            } else {
              log.d("Successfully responded to heartbeat", [notificationData.notification_id]);
            }
            break;
          }

          default: {
            const _exhaustiveCheck: never = notificationData;
            log.w("Unknown notification type received", [_exhaustiveCheck]);
          }
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
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
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
      log.w("Failed to get native push token", [nativePushTokenResult.error]);
      return err(nativePushTokenResult.error);
    }

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
