import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
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
import type { OnboardingStackParamList, SettingsStackParamList } from "../Navigators";
import { performServerRegistration } from "~/lib/server";
import { useAlert } from "~/contexts/AlertProvider";

type LightningAddressScreenRouteProp = RouteProp<
  OnboardingStackParamList & SettingsStackParamList,
  "LightningAddress"
>;

const LightningAddressScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<LightningAddressScreenRouteProp>();
  const { showAlert } = useAlert();
  const { fromOnboarding } = route.params || {};
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
        } else {
          navigation.goBack();
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
      } else {
        finishOnboarding();

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
            <Pressable onPress={() => navigation.goBack()} className="mr-4">
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
