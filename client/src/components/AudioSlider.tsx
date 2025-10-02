import React, { useState, useCallback } from "react";
import { View, PanResponder, GestureResponderEvent } from "react-native";

interface AudioSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  onSlidingComplete: (value: number) => void;
  disabled?: boolean;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
}

export const AudioSlider: React.FC<AudioSliderProps> = ({
  value,
  minimumValue,
  maximumValue,
  onSlidingComplete,
  disabled = false,
  minimumTrackTintColor = "#F7931A",
  maximumTrackTintColor = "#666666",
  thumbTintColor = "#F7931A",
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);

  const getPercentage = useCallback(() => {
    if (maximumValue <= minimumValue) return 0;
    return ((value - minimumValue) / (maximumValue - minimumValue)) * 100;
  }, [value, minimumValue, maximumValue]);

  const handleTouch = useCallback(
    (evt: GestureResponderEvent) => {
      if (disabled || sliderWidth === 0) return;
      const locationX = evt.nativeEvent.locationX;
      const percentage = Math.max(0, Math.min(1, locationX / sliderWidth));
      const newValue = minimumValue + percentage * (maximumValue - minimumValue);
      onSlidingComplete(newValue);
    },
    [disabled, sliderWidth, minimumValue, maximumValue, onSlidingComplete],
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: handleTouch,
        onPanResponderMove: handleTouch,
        onPanResponderRelease: handleTouch,
      }),
    [disabled, handleTouch],
  );

  const percentage = getPercentage();

  return (
    <View
      style={{
        height: 40,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
      onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View
        style={{
          height: 4,
          backgroundColor: maximumTrackTintColor,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${percentage}%`,
            backgroundColor: minimumTrackTintColor,
          }}
        />
      </View>
      <View
        style={{
          position: "absolute",
          left: `${percentage}%`,
          marginLeft: -10,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: thumbTintColor,
          borderWidth: 2,
          borderColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 5,
        }}
      />
    </View>
  );
};
