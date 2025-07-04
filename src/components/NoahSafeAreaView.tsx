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
    <View className={className}>
      <View
        style={[
          {
            flex: 1,
            top: insets.top,
            bottom: insets.bottom,
            left: insets.left,
            right: insets.right,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
