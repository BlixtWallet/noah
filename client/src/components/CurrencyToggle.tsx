import React from "react";
import { TouchableOpacity, View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { COLORS } from "~/lib/styleConstants";

interface CurrencyToggleProps {
  onPress: () => void;
  disabled?: boolean;
}

export const CurrencyToggle: React.FC<CurrencyToggleProps> = ({
  onPress,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="ml-3"
      activeOpacity={0.7}
    >
      <View className="bg-card border border-border rounded-full p-3 items-center justify-center min-w-[48px] min-h-[48px]">
        <FontAwesome
          name="arrows-v"
          size={20}
          color={disabled ? "#6b7280" : COLORS.BITCOIN_ORANGE}
        />
      </View>
    </TouchableOpacity>
  );
};
