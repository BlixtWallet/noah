import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "~/components/ui/text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const SuccessAnimation = ({
  onAnimationEnd,
  className,
}: {
  onAnimationEnd?: () => void;
  className?: string;
}) => {
  const circleRadius = 50;
  const checkmarkPathLength = 60; // Approximate length of the checkmark path

  const scale = useSharedValue(0);
  const strokeOffset = useSharedValue(checkmarkPathLength);

  const animatedCircleProps = useAnimatedProps(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedPathProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeOffset.value,
  }));

  useEffect(() => {
    scale.value = withTiming(1, { duration: 300 });
    strokeOffset.value = withDelay(200, withTiming(0, { duration: 400 }));

    if (onAnimationEnd) {
      const timer = setTimeout(onAnimationEnd, 2000); // Wait for animation to finish
      return () => clearTimeout(timer);
    }
  }, [onAnimationEnd, scale, strokeOffset]);

  return (
    <View className={`items-center justify-center ${className ?? ""}`}>
      <Svg width="120" height="120" viewBox="0 0 120 120">
        <AnimatedCircle
          cx="60"
          cy="60"
          r={circleRadius}
          fill="#22c55e" // green-500 from tailwind
          animatedProps={animatedCircleProps}
          originX="60"
          originY="60"
        />
        <AnimatedPath
          d="M40 60 L55 75 L80 45"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={checkmarkPathLength}
          animatedProps={animatedPathProps}
        />
      </Svg>
      <Text className="text-2xl font-bold text-green-500 mt-4">Success!</Text>
    </View>
  );
};

export default SuccessAnimation;
