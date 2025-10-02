import React from "react";
import { View, Text, Pressable, Platform, Linking } from "react-native";
import { ChevronRight } from "lucide-react-native";

interface UpdateWarningBannerProps {
  currentVersion: string;
  minimumVersion: string;
}

export const UpdateWarningBanner: React.FC<UpdateWarningBannerProps> = ({
  currentVersion,
  minimumVersion,
}) => {
  const handleUpdate = () => {
    const storeUrl =
      Platform.OS === "ios"
        ? "https://apps.apple.com/app/your-app-id"
        : "https://play.google.com/store/apps/details?id=your.package.name";

    Linking.openURL(storeUrl);
  };

  return (
    <Pressable onPress={handleUpdate} className="mx-4 mt-4 mb-2">
      <View className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-base font-semibold text-orange-500">Update Available</Text>
          <ChevronRight size={20} color="#f97316" />
        </View>

        <Text className="text-sm text-gray-300 mb-3">
          Please update to the latest version of the app for bug fixes and improvements.
        </Text>

        <View className="pt-3 border-t border-orange-500/20 gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-400">Current Version</Text>
            <Text className="text-sm font-medium text-orange-400">{currentVersion}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-400">Latest Version</Text>
            <Text className="text-sm font-medium text-orange-400">{minimumVersion}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};
