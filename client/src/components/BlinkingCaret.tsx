import React, { useEffect, useState } from "react";
import { View } from "react-native";

type BlinkingCaretProps = {
  color: string;
  height?: number;
  visible: boolean;
};

const BLINK_INTERVAL_MS = 530;

export const BlinkingCaret = ({
  color,
  height = 38,
  visible,
}: BlinkingCaretProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!visible) {
      setIsVisible(true);
      return;
    }

    const intervalId = setInterval(() => {
      setIsVisible((current) => !current);
    }, BLINK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <View
      style={{
        marginLeft: 4,
        width: 2,
        height,
        borderRadius: 999,
        opacity: isVisible ? 1 : 0,
        backgroundColor: color,
      }}
    />
  );
};
