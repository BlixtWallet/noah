import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const ReceiveAnimation = ({ className }: { className?: string }) => {
  const circleScale = useSharedValue(0);
  const checkmarkProgress = useSharedValue(0);
  const opacity = useSharedValue(0);

  const checkmarkPathLength = 100;

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200 });

    circleScale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1.15, { duration: 500, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) }),
    );

    checkmarkProgress.value = withDelay(
      400,
      withTiming(1, {
        duration: 600,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
      }),
    );
  }, []);

  const circleAnimatedProps = useAnimatedProps(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: opacity.value,
  }));

  const checkmarkAnimatedProps = useAnimatedProps(() => {
    const progress = checkmarkProgress.value;
    return {
      strokeDashoffset: checkmarkPathLength * (1 - progress),
      opacity: opacity.value,
    };
  });

  return (
    <View className={className}>
      <Svg width="120" height="120" viewBox="0 0 120 120">
        <AnimatedCircle cx="60" cy="60" r="55" fill="#22c55e" animatedProps={circleAnimatedProps} />
        <AnimatedPath
          d="M 35 60 L 52 77 L 85 44"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={checkmarkPathLength}
          strokeDashoffset={checkmarkPathLength}
          animatedProps={checkmarkAnimatedProps}
        />
      </Svg>
    </View>
  );
};

export default ReceiveAnimation;
