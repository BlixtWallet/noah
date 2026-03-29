import React from "react";
import { View, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";

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
  const { height: windowHeight } = useWindowDimensions();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const height = useSharedValue(0);
  const progress = useDerivedValue(() => withTiming(isOpen ? 0 : 1, { duration }));
  const [shouldRender, setShouldRender] = React.useState(isOpen);

  const bottomInset = Math.max(bottomTabBarHeight + 12, insets.bottom + 12);
  const topInset = Math.max(insets.top + 20, 28);
  const maxSheetHeight = Math.max(windowHeight - topInset - bottomInset, 320);

  React.useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }

    const timeout = setTimeout(() => {
      setShouldRender(false);
    }, duration);

    return () => clearTimeout(timeout);
  }, [duration, isOpen]);

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

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <Animated.View
        pointerEvents={isOpen ? "auto" : "none"}
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
        pointerEvents={isOpen ? "auto" : "none"}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
        style={[
          {
            position: "absolute",
            bottom: bottomInset,
            maxHeight: maxSheetHeight,
            left: 0,
            right: 0,
            zIndex: 2,
          },
          sheetStyle,
        ]}
        className="overflow-hidden rounded-[32px] border border-border bg-card px-6 pt-5"
      >
        <View className="mb-4 h-1 w-12 self-center rounded-full bg-muted-foreground/30" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 12) + 20,
          }}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
};
