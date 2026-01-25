import { useUniwind } from "uniwind";

export type ColorScheme = "light" | "dark";

const lightColors = {
  foreground: "#1a2332",
  background: "#f5f8fc",
  mutedForeground: "#5a6578",
  border: "#d8e2ed",
  card: "#edf2f9",
  primary: "#1a2332",
  tabBarBackground: "#f5f8fc",
  tabBarInactive: "#6b7a8a",
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
  const { theme } = useUniwind();
  const colorScheme: ColorScheme = theme === "dark" ? "dark" : "light";
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
