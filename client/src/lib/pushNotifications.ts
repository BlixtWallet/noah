import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import logger from "~/lib/log";
import { captureException } from "@sentry/react-native";
import { offboardTask, submitInvoice, triggerBackupTask } from "./tasks";
import { registerPushToken, reportJobStatus, heartbeatResponse } from "~/lib/api";
import { err, ok, Result, ResultAsync } from "neverthrow";
import { NotificationData, ReportType } from "~/types/serverTypes";
import { maintanance, sync } from "./walletApi";
import { tryClaimLightningReceive } from "./paymentsApi";
import { useWalletStore } from "~/store/walletStore";
import { formatBip177 } from "./utils";
import { updateWidget } from "~/hooks/useWidget";

const log = logger("pushNotifications");

export type PushPermissionStatus = {
  status: Notifications.PermissionStatus;
  isPhysicalDevice: boolean;
};

export type RegisterForPushResult =
  | { kind: "success"; pushToken: string }
  | { kind: "permission_denied"; permissionStatus: Notifications.PermissionStatus }
  | { kind: "device_not_supported" };

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

/**
 * Reports job completion status to the server.
 * Called after each background task completes or fails.
 */
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

  const jobStatusResult = await reportJobStatus({
    report_type,
    status: "success",
    error_message: null,
    k1,
  });

  if (jobStatusResult.isErr()) {
    log.i("Failed to report job status", [jobStatusResult.error]);
    return;
  }

  log.d(`Triggered ${report_type} task, successfully`);
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    /**
     * BACKGROUND JOB COORDINATION:
     *
     * Set flag to true at the start of any background job. This signals to the
     * foreground app (HomeScreen) that wallet operations are in progress.
     *
     * If the user opens the app while this is true, the app will wait for this
     * flag to clear before attempting its own wallet operations, preventing
     * concurrent access conflicts that cause the app to hang.
     *
     * The flag is cleared in the finally block below to ensure it's always reset,
     * even if the task fails. If the task crashes before finally executes, the
     * timestamp-based stale flag detection will clear it after 60 seconds.
     */
    useWalletStore.getState().setBackgroundJobRunning(true);

    try {
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
            case "maintenance": {
              const result = await maintanance();
              // Also perform a sync after maintenance
              await sync();
              await handleTaskCompletion("maintenance", result, notificationData.k1);

              // Refresh widget after maintenance
              await updateWidget();
              break;
            }

            case "lightning_invoice_request": {
              log.i("Received lightning invoice request", [notificationData]);
              const invoiceResult = await submitInvoice(
                notificationData.transaction_id,
                notificationData.k1,
                notificationData.amount,
              );

              // Wait for the invoice to be paid
              // This is a terrible solution, but it is what it is for now
              if (invoiceResult.isOk()) {
                const claimResult = await tryClaimLightningReceive(
                  invoiceResult.value.payment_hash,
                  true,
                );

                if (claimResult.isOk()) {
                  const sats = notificationData.amount / 1000;
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: "Lightning Payment Received! ⚡",
                      body: `You received ${formatBip177(sats)}`,
                    },
                    trigger: null,
                  });
                  log.d("Local notification triggered for payment", [sats]);

                  // Refresh widget after lightning payment
                  await updateWidget();
                }
              }
              break;
            }

            case "backup_trigger": {
              const result = await triggerBackupTask();
              await handleTaskCompletion("backup", result, notificationData.k1);
              log.d("Backup task completed");
              break;
            }

            case "offboarding": {
              const result = await offboardTask(
                notificationData.offboarding_request_id,
                notificationData.address,
                notificationData.address_signature,
              );
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
    } finally {
      /**
       * Always clear the background job flag, even if an error occurred.
       *
       * This ensures the foreground app doesn't wait indefinitely. The finally
       * block executes even if there are errors in the try block, ensuring
       * proper cleanup.
       *
       * Note: In catastrophic failures (OS kills task, out of memory, etc.),
       * the finally block may not execute. In those cases, the timestamp-based
       * stale flag detection in walletStore.clearStaleBackgroundJobFlag() will
       * clean up after 60 seconds.
       */
      useWalletStore.getState().setBackgroundJobRunning(false);
      log.d("[Background Job] Completed, flag cleared");
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

export async function getPushPermissionStatus(): Promise<Result<PushPermissionStatus, Error>> {
  if (!Device.isDevice) {
    // Simulators and emulators cannot receive push notifications; skip gating in that scenario.
    return ok({ status: Notifications.PermissionStatus.DENIED, isPhysicalDevice: false });
  }

  const permissionResult = await ResultAsync.fromPromise(
    Notifications.getPermissionsAsync(),
    (e) => e as Error,
  );

  if (permissionResult.isErr()) {
    return err(permissionResult.error);
  }

  return ok({ status: permissionResult.value.status, isPhysicalDevice: true });
}

export async function registerForPushNotificationsAsync(): Promise<Result<RegisterForPushResult, Error>> {
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  // If the device is not a physical device, return a non-supported status
  if (!Device.isDevice) {
    return ok({ kind: "device_not_supported" });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return ok({ kind: "permission_denied", permissionStatus: finalStatus });
  }
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
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
  return ok({ kind: "success", pushToken: pushTokenString });
}

export async function registerPushTokenWithServer(pushToken: string): Promise<Result<void, Error>> {
  const result = await registerPushToken({ push_token: pushToken });

  if (result.isErr()) {
    return err(result.error);
  }

  return ok(undefined);
}
