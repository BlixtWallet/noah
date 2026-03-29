import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { COLORS } from "~/lib/styleConstants";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const ReceiveAnimation = ({ className }: { className?: string }) => {
  const coinRadius = useSharedValue(46);
  const coinOpacity = useSharedValue(0);
  const innerCoinRadius = useSharedValue(34);
  const checkmarkProgress = useSharedValue(0);

  const checkmarkPathLength = 74;

  useEffect(() => {
    coinOpacity.value = withTiming(1, { duration: 220 });
    coinRadius.value = withSequence(
      withTiming(36, { duration: 0 }),
      withTiming(50, { duration: 460, easing: Easing.out(Easing.back(1.1)) }),
      withTiming(46, { duration: 220, easing: Easing.inOut(Easing.quad) }),
    );
    innerCoinRadius.value = withSequence(
      withTiming(26, { duration: 0 }),
      withTiming(39, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(34, { duration: 200, easing: Easing.inOut(Easing.quad) }),
    );

    checkmarkProgress.value = withDelay(
      360,
      withTiming(1, {
        duration: 640,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
      }),
    );
  }, [checkmarkProgress, coinOpacity, coinRadius, innerCoinRadius]);

  const coinAnimatedProps = useAnimatedProps(() => ({
    r: coinRadius.value,
    opacity: coinOpacity.value,
  }));

  const innerCoinAnimatedProps = useAnimatedProps(() => ({
    r: innerCoinRadius.value,
    opacity: coinOpacity.value,
  }));

  const checkmarkAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: checkmarkPathLength * (1 - checkmarkProgress.value),
    opacity: checkmarkProgress.value,
  }));

  return (
    <View className={className}>
      <Svg width="160" height="160" viewBox="0 0 160 160">
        <AnimatedCircle
          cx="80"
          cy="80"
          fill={COLORS.BITCOIN_ORANGE}
          animatedProps={coinAnimatedProps}
        />
        <AnimatedCircle
          cx="80"
          cy="80"
          fill="#D59A43"
          animatedProps={innerCoinAnimatedProps}
        />
        <AnimatedPath
          d="M 58 80 L 73 95 L 104 64"
          stroke="white"
          strokeWidth="9"
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
