import React from "react";
import { View, Pressable } from "react-native";
import { ChevronRight, Mail } from "lucide-react-native";
import { Text } from "./ui/text";
import { useIconColor } from "~/hooks/useTheme";
import { COLORS } from "~/lib/styleConstants";

interface EmailVerificationBannerProps {
  onPress: () => void;
}

export const EmailVerificationBanner: React.FC<EmailVerificationBannerProps> = ({ onPress }) => {
  const iconColor = useIconColor();

  return (
    <Pressable onPress={onPress} className="mx-4 mt-4 mb-2">
      <View className="bg-card border border-border rounded-xl p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Mail size={20} color={COLORS.BITCOIN_ORANGE} />
            <Text className="text-base font-semibold" style={{ color: COLORS.BITCOIN_ORANGE }}>
              Verify Your Email
            </Text>
          </View>
          <ChevronRight size={20} color={iconColor} />
        </View>

        <Text className="text-sm text-muted-foreground">
          Your wallet is currently limited. Verify your email to enable full functionality including
          payments and backups.
        </Text>
      </View>
    </Pressable>
  );
};
