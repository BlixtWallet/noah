import { Platform } from "react-native";
import { err, ok, Result } from "neverthrow";
import logger from "~/lib/log";
import {
  registerUnifiedPush as nativeRegisterUnifiedPush,
  unregisterUnifiedPush as nativeUnregisterUnifiedPush,
  getUnifiedPushEndpoint as nativeGetUnifiedPushEndpoint,
  hasGooglePlayServices,
  getAppVariant,
} from "noah-tools";

const log = logger("unifiedPush");

export class UnifiedPushManager {
  private static instance: UnifiedPushManager;

  private constructor() {
    log.d("UnifiedPushManager instance created");
  }

  public static getInstance(): UnifiedPushManager {
    if (!UnifiedPushManager.instance) {
      UnifiedPushManager.instance = new UnifiedPushManager();
    }
    return UnifiedPushManager.instance;
  }

  public async register(): Promise<Result<string, Error>> {
    log.d("register() called");

    if (Platform.OS !== "android") {
      log.w("register() called on non-Android platform");
      return err(new Error("UnifiedPush is only supported on Android"));
    }

    try {
      log.d("Checking Google Play Services status...");
      const hasPlayServices = hasGooglePlayServices();
      log.d(`Google Play Services available: ${hasPlayServices}`);

      // Temporarily allowing UnifiedPush even with Google Play Services for testing
      // if (hasPlayServices) {
      //   return err(
      //     new Error("Google Play Services is available. Use standard push notifications instead."),
      //   );
      // }

      const variant = getAppVariant();
      const topic = `noah-${variant}`;

      log.i(`Starting UnifiedPush registration for topic: ${topic}`);

      log.d("Calling nativeRegisterUnifiedPush...");
      nativeRegisterUnifiedPush(topic);
      log.d("nativeRegisterUnifiedPush called successfully");

      log.d("Waiting 2 seconds for registration to complete...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      log.d("Attempting to get endpoint...");
      const endpoint = await nativeGetUnifiedPushEndpoint();
      log.d(`Received endpoint from native: "${endpoint}" (length: ${endpoint.length})`);

      if (!endpoint || endpoint === "") {
        log.e(`No endpoint received. Topic was: ${topic}`);
        log.e("Make sure you have:");
        log.e("1. Installed a UnifiedPush distributor (e.g., ntfy)");
        log.e(`2. Subscribed to topic: ${topic}`);
        log.e("3. The distributor app is running");
        return err(
          new Error(
            `Failed to get UnifiedPush endpoint. Please register Noah in your UnifiedPush app with topic: ${topic}`,
          ),
        );
      }

      log.i("UnifiedPush registration successful!");
      log.d(`Endpoint: ${endpoint}`);
      return ok(endpoint);
    } catch (error) {
      log.e("UnifiedPush registration failed with exception", [error]);
      return err(error as Error);
    }
  }

  public async unregister(): Promise<Result<void, Error>> {
    log.d("unregister() called");

    if (Platform.OS !== "android") {
      log.w("unregister() called on non-Android platform");
      return err(new Error("UnifiedPush is only supported on Android"));
    }

    try {
      log.d("Calling nativeUnregisterUnifiedPush...");
      nativeUnregisterUnifiedPush();
      log.i("UnifiedPush unregistered successfully");
      return ok(undefined);
    } catch (error) {
      log.e("Failed to unregister UnifiedPush", [error]);
      return err(error as Error);
    }
  }

  public async getEndpoint(): Promise<Result<string, Error>> {
    log.d("getEndpoint() called");

    if (Platform.OS !== "android") {
      log.d("getEndpoint() - not Android, returning empty string");
      return ok("");
    }

    try {
      log.d("Calling nativeGetUnifiedPushEndpoint...");
      const endpoint = await nativeGetUnifiedPushEndpoint();
      log.d(`getEndpoint() result: "${endpoint}" (length: ${endpoint.length})`);
      return ok(endpoint);
    } catch (error) {
      log.e("Failed to get UnifiedPush endpoint", [error]);
      return err(error as Error);
    }
  }

  public static needsUnifiedPush(): boolean {
    if (Platform.OS !== "android") {
      return false;
    }
    const needs = !hasGooglePlayServices();
    log.d(`needsUnifiedPush: ${needs}`);
    return needs;
  }

  public static getRequiredTopic(): string {
    const variant = getAppVariant();
    return `noah-${variant}`;
  }

  public static getSubscriptionInstructions(): string {
    const topic = UnifiedPushManager.getRequiredTopic();
    return `To receive notifications without Google Play Services:

1. Install a UnifiedPush app (recommended: ntfy from F-Droid)
2. Open the UnifiedPush app and subscribe to: ${topic}
3. Make sure the app is allowed to run in the background
4. Return to Noah and the notification system will be configured automatically

For ntfy users:
- Server: https://ntfy.sh
- Topic: ${topic}`;
  }
}

export const unifiedPushManager = UnifiedPushManager.getInstance();
