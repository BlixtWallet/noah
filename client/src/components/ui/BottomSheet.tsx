import React from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  duration?: number;
  backdropOpacity?: number;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  duration = 300,
  backdropOpacity = 0.5,
}) => {
  const insets = useSafeAreaInsets();
  const height = useSharedValue(0);
  const progress = useDerivedValue(() => withTiming(isOpen ? 0 : 1, { duration }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * 2 * height.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * backdropOpacity,
    zIndex: isOpen ? 1 : withDelay(duration, withTiming(-1, { duration: 0 })),
  }));

  const handleBackdropPress = () => {
    scheduleOnRN(onClose);
  };

  if (!isOpen && progress.value === 1) {
    return null;
  }
  return (
    <>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 1)",
          },
          backdropStyle,
        ]}
      >
        <Pressable className="flex-1" onPress={handleBackdropPress} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
        style={[
          {
            position: "absolute",
            bottom: Math.max(insets.bottom + 60, 120),
            minHeight: 550,
            left: 0,
            right: 0,
            zIndex: 2,
          },
          sheetStyle,
        ]}
        className="bg-card border-t border-border rounded-t-3xl p-8 pb-12"
      >
        <View className="w-12 h-1 bg-muted-foreground/30 rounded-full self-center mb-8" />
        {children}
      </Animated.View>
    </>
  );
};
