import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "~/components/ui/text";
import { NoahButton } from "~/components/ui/NoahButton";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import {
  registerUnifiedPush,
  getUnifiedPushEndpoint,
  getUnifiedPushDistributors,
  setUnifiedPushDistributor,
} from "noah-tools";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { registerUnifiedPushTokenWithServer } from "~/lib/pushNotifications";
import Clipboard from "@react-native-clipboard/clipboard";
import type { OnboardingStackParamList } from "~/Navigators";

const UnifiedPushScreen = () => {
  const [endpoint, setEndpoint] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "registering" | "registered" | "error">("idle");
  const route = useRoute<RouteProp<OnboardingStackParamList, "UnifiedPush">>();
  const fromOnboarding = route.params?.fromOnboarding;
  const [distributors, setDistributors] = useState<
    Array<{ id: string; name: string; isSaved: boolean; isConnected: boolean }>
  >([]);
  const [selectedDistributor, setSelectedDistributor] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();

  useEffect(() => {
    checkEndpoint();
    refreshDistributors();
  }, []);

  const checkEndpoint = () => {
    const current = getUnifiedPushEndpoint();
    if (current) {
      setEndpoint(current);
      setStatus("registered");
    }
  };

  const refreshDistributors = () => {
    const list = getUnifiedPushDistributors();
    setDistributors(list);

    const saved = list.find((d) => d.isSaved) ?? list.find((d) => d.isConnected);
    setSelectedDistributor(saved?.id ?? null);
  };

  const handleSelectDistributor = (id: string | null) => {
    setUnifiedPushDistributor(id);
    setSelectedDistributor(id);
    refreshDistributors();
  };

  const handleRegister = async () => {
    try {
      setStatus("registering");
      if (selectedDistributor) {
        setUnifiedPushDistributor(selectedDistributor);
      }
      registerUnifiedPush();

      // Poll for endpoint update since it's async via broadcast
      const interval = setInterval(() => {
        const ep = getUnifiedPushEndpoint();
        if (ep) {
          clearInterval(interval);
          setEndpoint(ep);
          setStatus("registered");
          // Register with backend
          registerUnifiedPushTokenWithServer(ep).then((res) => {
            if (res.isErr()) {
              // console.error("Failed to register with Noah server", res.error);
            }
          });
        }
      }, 1000);

      // Timeout after 30s
      setTimeout(() => clearInterval(interval), 30000);
    } catch (e) {
      setStatus("error");
    }
  };

  const copyToClipboard = () => {
    Clipboard.setString(endpoint);
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background p-4">
      <View className="flex-1">
        <Text className="text-2xl font-bold mb-4 mt-6 text-center">UnifiedPush Setup</Text>

        <View className="bg-card p-4 rounded-lg mb-6">
          <Text className="text-muted-foreground mb-4">
            Google Play Services is not available. To receive notifications, please use a
            UnifiedPush distributor (like ntfy).
          </Text>

          <View className="mb-4">
            <Text className="font-bold mb-2">Select Distributor</Text>
            {distributors.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                No distributors detected. Install ntfy or another UnifiedPush distributor.
              </Text>
            ) : (
              distributors.map((d) => (
                <NoahButton
                  key={d.id}
                  variant={d.id === selectedDistributor ? "default" : "outline"}
                  className="mb-2"
                  onPress={() => handleSelectDistributor(d.id)}
                >
                  <Text className="font-semibold">{d.name}</Text>
                  <Text className="text-xs text-muted-foreground">{d.id}</Text>
                </NoahButton>
              ))
            )}
          </View>

          <View className="mb-4">
            <Text className="font-bold mb-2">Current Endpoint:</Text>
            <Text className="text-xs bg-secondary p-2 rounded text-secondary-foreground font-mono">
              {endpoint || "Not registered"}
            </Text>
            {endpoint ? (
              <NoahButton onPress={copyToClipboard} variant="outline" className="mt-2">
                Copy Endpoint
              </NoahButton>
            ) : null}
          </View>

          {status === "idle" || status === "error" ? (
            <NoahButton onPress={handleRegister}>Register with UnifiedPush</NoahButton>
          ) : status === "registering" ? (
            <NoahButton disabled>Registering...</NoahButton>
          ) : (
            <NoahButton
              onPress={() =>
                fromOnboarding
                  ? navigation.navigate("LightningAddress", { fromOnboarding: true })
                  : navigation.goBack()
              }
              variant="secondary"
            >
              Done
            </NoahButton>
          )}
        </View>

        <Text className="text-sm text-muted-foreground text-center">
          Install a distributor app like "ntfy" from F-Droid to enable push notifications.
        </Text>
      </View>
    </NoahSafeAreaView>
  );
};

export default UnifiedPushScreen;
