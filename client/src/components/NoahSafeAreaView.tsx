import React from "react";
import { View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function NoahSafeAreaView({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  className?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
        },
        style,
      ]}
      className={className}
    >
      {children}
    </View>
  );
}
