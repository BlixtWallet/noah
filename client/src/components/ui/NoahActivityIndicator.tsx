import React from "react";
import { ActivityIndicator, ActivityIndicatorProps } from "react-native";
import { COLORS } from "../../lib/styleConstants";

interface NoahActivityIndicatorProps extends Omit<ActivityIndicatorProps, 'color'> {
  size?: "small" | "large" | number;
  color?: string;
}

export const NoahActivityIndicator: React.FC<NoahActivityIndicatorProps> = ({
  size = "large",
  color = COLORS.BITCOIN_ORANGE,
  ...props
}) => {
  return <ActivityIndicator size={size} color={color} {...props} />;
};
