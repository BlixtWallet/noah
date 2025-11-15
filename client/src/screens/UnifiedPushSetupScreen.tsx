import React, { useState, useEffect } from "react";
import { View, ScrollView, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "../Navigators";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AlertTriangle, CheckCircle, Info } from "lucide-react-native";
import * as Device from "expo-device";
import { UnifiedPushManager } from "~/lib/unifiedPush";
import { registerPushTokenWithServer } from "~/lib/pushNotifications";
import logger from "~/lib/log";

const log = logger("UnifiedPushSetupScreen");

const UnifiedPushSetupScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const [isRegistering, setIsRegistering] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const topic = UnifiedPushManager.getRequiredTopic();

  useEffect(() => {
    checkExistingEndpoint();
  }, []);

  const checkExistingEndpoint = async () => {
    const manager = UnifiedPushManager.getInstance();
    const result = await manager.getEndpoint();
    if (result.isOk() && result.value && result.value !== "") {
      setEndpoint(result.value);
      setSuccess(true);
    }
  };

  const handleRegister = async () => {
    if (!Device.isDevice) {
      setError("Push notifications require a physical device");
      return;
    }

    if (Platform.OS !== "android") {
      setError("UnifiedPush is only available on Android");
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const manager = UnifiedPushManager.getInstance();
      const result = await manager.register();

      if (result.isErr()) {
        setError(result.error.message);
        setIsRegistering(false);
        return;
      }

      setEndpoint(result.value);

      const serverResult = await registerPushTokenWithServer(result.value);
      if (serverResult.isErr()) {
        setError(
          `Registered locally but failed to sync with server: ${serverResult.error.message}`,
        );
        setIsRegistering(false);
        return;
      }

      setSuccess(true);
      log.d("UnifiedPush setup completed successfully");
    } catch (err) {
      setError(`Unexpected error: ${err}`);
      log.e("UnifiedPush setup failed", [err]);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSkip = () => {
    navigation.navigate("Configuration");
  };

  const handleContinue = () => {
    navigation.navigate("Configuration");
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="pt-8">
          <Text className="text-3xl font-bold mb-4 text-center">Push Notifications Setup</Text>

          {!Device.isDevice && (
            <Alert icon={AlertTriangle} variant="destructive" className="mb-4">
              <AlertTitle>Simulator Detected</AlertTitle>
              <AlertDescription>
                Push notifications require a physical device. Please test on a real device.
              </AlertDescription>
            </Alert>
          )}

          {Device.isDevice && (
            <>
              <Alert icon={Info} className="mb-6">
                <AlertTitle>UnifiedPush Required</AlertTitle>
                <AlertDescription>
                  To receive notifications, you'll need a UnifiedPush distributor app like ntfy.
                </AlertDescription>
              </Alert>

              <View className="mb-6">
                <Text className="text-xl font-semibold mb-3 text-foreground">
                  Step 1: Install a UnifiedPush App
                </Text>
                <Text className="text-base text-muted-foreground mb-2">
                  Install a UnifiedPush distributor app. We recommend ntfy from F-Droid or GitHub.
                </Text>
              </View>

              <View className="mb-6">
                <Text className="text-xl font-semibold mb-3 text-foreground">
                  Step 2: Subscribe to Topic
                </Text>
                <Text className="text-base text-muted-foreground mb-2">
                  Open ntfy and subscribe to:
                </Text>
                <View className="bg-card p-4 rounded-lg border border-border">
                  <Text className="text-lg font-mono text-foreground">{topic}</Text>
                </View>
                <Text className="text-sm text-muted-foreground mt-2">
                  Server: https://ntfy.sh (or your self-hosted instance)
                </Text>
              </View>

              <View className="mb-6">
                <Text className="text-xl font-semibold mb-3 text-foreground">
                  Step 3: Register Noah
                </Text>
                <Text className="text-base text-muted-foreground mb-4">
                  Once you've subscribed in ntfy, tap the button below to complete setup.
                </Text>

                {error && (
                  <Alert icon={AlertTriangle} variant="destructive" className="mb-4">
                    <AlertTitle>Setup Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && endpoint && endpoint !== "" && (
                  <Alert icon={CheckCircle} className="mb-4">
                    <AlertTitle>Success!</AlertTitle>
                    <AlertDescription>
                      Push notifications are configured and ready.
                    </AlertDescription>
                  </Alert>
                )}

                <NoahButton
                  onPress={handleRegister}
                  disabled={isRegistering || success}
                  size="lg"
                  className="mb-3"
                >
                  {isRegistering ? "Checking..." : success ? "Registered ✓" : "Check & Register"}
                </NoahButton>
              </View>
            </>
          )}

          <View className="flex-row justify-between">
            <NoahButton onPress={handleSkip} variant="outline" size="lg">
              Skip for Now
            </NoahButton>
            {success && (
              <NoahButton onPress={handleContinue} size="lg">
                Continue
              </NoahButton>
            )}
          </View>

          <Text className="text-xs text-muted-foreground text-center mt-6">
            You can configure this later in Settings if needed.
          </Text>
        </View>
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default UnifiedPushSetupScreen;
