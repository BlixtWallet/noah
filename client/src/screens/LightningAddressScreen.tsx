import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Input } from "../components/ui/input";
import { NoahButton } from "../components/ui/NoahButton";
import { Text } from "../components/ui/text";
import Icon from "@react-native-vector-icons/ionicons";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { useUpdateLightningAddress } from "../hooks/useUpdateLightningAddress";
import { getLnurlDomain } from "../constants";
import { useServerStore } from "../store/serverStore";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { CheckCircle } from "lucide-react-native";

const LightningAddressScreen = () => {
  const navigation = useNavigation();
  const { lightningAddress } = useServerStore();
  const domain = getLnurlDomain();
  const currentUsername = lightningAddress ? lightningAddress.split("@")[0] : "";
  const [username, setUsername] = useState(currentUsername);
  const [showUpdateSuccess, setShowUpdateSuccess] = useState(false);

  const updateLightningAddressMutation = useUpdateLightningAddress({
    onSuccess: () => {
      setShowUpdateSuccess(true);
      setTimeout(() => {
        setShowUpdateSuccess(false);
        navigation.goBack();
      }, 2000);
    },
  });

  const handleSave = () => {
    if (username) {
      const newAddress = `${username}@${domain}`;
      if (newAddress !== lightningAddress) {
        updateLightningAddressMutation.mutate(newAddress);
      }
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Lightning Address</Text>
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
          isLoading={updateLightningAddressMutation.isPending}
          disabled={!username || `${username}@${domain}` === lightningAddress}
        >
          Save
        </NoahButton>
      </View>
    </NoahSafeAreaView>
  );
};

export default LightningAddressScreen;
