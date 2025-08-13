import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { PLATFORM, getServerEndpoint } from "~/constants";
import { peakKeyPair } from "./paymentsApi";
import { loadWallet, signMessage } from "./walletApi";
import logger from "~/lib/log";

import { syncWallet } from "~/lib/sync";
import { captureException, captureMessage } from "@sentry/react-native";
import { isWalletLoaded } from "react-native-nitro-ark";

const log = logger("pushNotifications");

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error, executionInfo }) => {
    try {
      log.d("[Background Job] data", [data]);

      const isNotificationResponse = "actionIdentifier" in data;

      log.d("[Background Job] isNotificationResponse", [isNotificationResponse]);

      // if (data && (data as any).data.body === "{}") {
      //   log.d("[Background Job] data.data.body === '{}'");
      //   return;
      // }

      if (isNotificationResponse) {
        // Do something with the notification response from user
        log.d("[Background Job] user pressed notification");
      } else {
        // Do something with the data from notification that was received
        log.d("[Background Job] loading wallet in background");
        const isLoaded = await isWalletLoaded();
        log.d("[Background Job] isWalletLoaded", [isLoaded]);
        if (!isLoaded) {
          log.d("[Background Job] wallet not loaded, loading now");
          await loadWallet();
        }

        log.d("[Background Job] syncing wallet in background");
        await syncWallet();
        const { public_key: pubkey } = await peakKeyPair(0);

        captureMessage(
          `Background notification task executed and wallet synced for pubkey: ${pubkey}`,
          "info",
        );
      }
    } catch (e) {
      captureException(
        new Error(
          `Failed to background sync: ${error instanceof Error ? error.message : String(error)}`,
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
  const { public_key: pubkey } = await peakKeyPair(index);
  const signature = await signMessage(k1, index);

  const registerUrl = `${serverEndpoint}/v0/register_push_token`;
  const registrationResponse = await fetch(registerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      push_token: pushToken,
      pubkey,
      sig: signature,
      k1,
    }),
  });

  if (!registrationResponse.ok) {
    const errorBody = await registrationResponse.text();
    throw new Error(`Failed to register push token: ${registrationResponse.status} ${errorBody}`);
  }
}
