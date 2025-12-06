import { useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const lightColors = {
  foreground: "#1a1a1a",
  background: "#ebe5db",
  mutedForeground: "#555559",
  border: "#c7c0b5",
  card: "#e2dcd2",
  primary: "#1a1a1a",
  tabBarBackground: "#ebe5db",
  tabBarInactive: "#6b6b70",
};

const darkColors = {
  foreground: "#fafafa",
  background: "#0a0a0b",
  mutedForeground: "#a1a1aa",
  border: "#27272a",
  card: "#0a0a0b",
  primary: "#fafafa",
  tabBarBackground: "#1C1C1E",
  tabBarInactive: "#8e8e93",
};

export type ThemeColors = typeof lightColors;

export function useTheme() {
  const systemColorScheme = useColorScheme();
  const colorScheme: ColorScheme = systemColorScheme === "dark" ? "dark" : "light";
  const isDark = colorScheme === "dark";

  const colors: ThemeColors = isDark ? darkColors : lightColors;

  return {
    colorScheme,
    isDark,
    colors,
  };
}

export function useThemeColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

export function useIconColor(): string {
  const { colors } = useTheme();
  return colors.foreground;
}
