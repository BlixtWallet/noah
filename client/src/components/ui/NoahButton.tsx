import React from "react";
import { ViewStyle } from "react-native";
import { Text } from "./text";
import { Button, type ButtonProps } from "./button";
import { COLORS } from "../../lib/styleConstants";
import { NoahActivityIndicator } from "./NoahActivityIndicator";
import { useTheme } from "../../hooks/useTheme";

interface NoahButtonProps extends Omit<ButtonProps, "style"> {
  children: React.ReactNode;
  isLoading?: boolean;
  style?: ViewStyle;
  textClassName?: string;
}

export const NoahButton = ({
  children,
  isLoading,
  style,
  textClassName,
  ...props
}: NoahButtonProps) => {
  const { isDark } = useTheme();
  const textColor = isDark ? "white" : "#1a1a1a";

  return (
    <Button {...props} style={[{ backgroundColor: COLORS.BITCOIN_ORANGE }, style]}>
      {isLoading ? (
        <NoahActivityIndicator color={textColor} />
      ) : (
        <Text className={textClassName || "font-bold"} style={{ color: textColor }}>
          {children}
        </Text>
      )}
    </Button>
  );
};
