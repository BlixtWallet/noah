import React from "react";
import { ActivityIndicator, ViewStyle } from "react-native";
import { Text } from "./text";
import { Button, type ButtonProps } from "./button";
import { COLORS } from "../../lib/constants";

interface NoahButtonProps extends Omit<ButtonProps, "style"> {
  children: React.ReactNode;
  isLoading?: boolean;
  style?: ViewStyle;
}

export const NoahButton = ({ children, isLoading, style, ...props }: NoahButtonProps) => {
  return (
    <Button {...props} style={[{ backgroundColor: COLORS.BITCOIN_ORANGE }, style]}>
      {isLoading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text className="font-bold">{children}</Text>
      )}
    </Button>
  );
};
