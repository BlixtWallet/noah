import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Input } from "../components/ui/input";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import Icon from "@react-native-vector-icons/ionicons";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useUpdateLightningAddress } from "../hooks/useUpdateLightningAddress";
import { getLnurlDomain } from "../constants";
import { useServerStore } from "../store/serverStore";
import { useWalletStore } from "../store/walletStore";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { CheckCircle } from "lucide-react-native";

import { performServerRegistration } from "~/lib/server";
import { useAlert } from "~/contexts/AlertProvider";

const LightningAddressScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showAlert } = useAlert();
  const fromOnboarding = params.fromOnboarding === "true";
  const { finishOnboarding } = useWalletStore();
  const { lightningAddress } = useServerStore();
  const domain = getLnurlDomain();
  const currentUsername = lightningAddress ? lightningAddress.split("@")[0] : "";
  const [username, setUsername] = useState(currentUsername);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const updateLightningAddressMutation = useUpdateLightningAddress({
    onSuccess: () => {
      setShowUpdateSuccess(true);
      setTimeout(() => {
        setShowUpdateSuccess(false);
        if (fromOnboarding) {
          finishOnboarding();
          router.replace("/(tabs)/(home)");
        } else {
          router.back();
        }
      }, 2000);
    },
  });

  const handleSave = async () => {
    if (username) {
      const newAddress = `${username}@${domain}`;
      if (fromOnboarding) {
        setIsSaving(true);
        const result = await performServerRegistration(newAddress);
        if (result.isOk()) {
          finishOnboarding();
          router.replace("/(tabs)/(home)");
        } else {
          showAlert({
            title: "Error",
            description: `Failed to register lightning address: ${result.error.message}`,
          });
        }
        setIsSaving(false);
      } else if (newAddress !== lightningAddress) {
        updateLightningAddressMutation.mutate(newAddress);
      }
    }
  };

  const handleSkip = async () => {
    if (fromOnboarding) {
      setIsSkipping(true);
      // Register with a server-generated lightning address
      const result = await performServerRegistration(null);
      if (result.isOk()) {
        finishOnboarding();
        router.replace("/(tabs)/(home)");
      } else {
        finishOnboarding();
        router.replace("/(tabs)/(home)");

        showAlert({
          title: "Error",
          description: `Failed to register with server: ${result.error.message}`,
        });
      }
      setIsSkipping(false);
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <View className="flex-row items-center mb-8">
          {!fromOnboarding && (
            <Pressable onPress={() => router.back()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
          )}
          <Text className="text-2xl font-bold text-foreground">
            {fromOnboarding ? "Choose your Lightning Address" : "Lightning Address"}
          </Text>
        </View>
        {showUpdateSuccess && (
          <Alert icon={CheckCircle} className="mb-4">
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>Lightning address has been updated.</AlertDescription>
          </Alert>
        )}
        <View className="mb-4 mt-9">
          <View className="flex-row items-center border-border bg-card rounded-lg">
            <Input
              value={username}
              onChangeText={setUsername}
              className="flex-1 p-4 text-foreground"
              placeholder="Enter your desired username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-muted-foreground p-4">@{domain}</Text>
          </View>
        </View>
        <Text className="text-muted-foreground mt-2">Pick your own lightning address.</Text>
        <NoahButton
          onPress={handleSave}
          className="mt-8"
          isLoading={isSaving || updateLightningAddressMutation.isPending}
          disabled={!username}
        >
          {fromOnboarding && `${username}@${domain}` === lightningAddress ? "Continue" : "Save"}
        </NoahButton>
        {fromOnboarding && (
          <NoahButton
            onPress={handleSkip}
            className="mt-4"
            variant="outline"
            isLoading={isSkipping}
          >
            Skip
          </NoahButton>
        )}
      </View>
    </NoahSafeAreaView>
  );
};

export default LightningAddressScreen;
