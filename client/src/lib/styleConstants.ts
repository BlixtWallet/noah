export const COLORS = {
  BITCOIN_ORANGE: "#c98a3c",
  TAB_BAR_BACKGROUND: "#1C1C1E",
  TAB_BAR_INACTIVE: "#8e8e93",
  SUCCESS: "#22c55e",
};

export const LIGHT_COLORS = {
  foreground: "#1a1a1a",
  background: "#ebe5db",
  tabBarBackground: "#ebe5db",
  tabBarInactive: "#6b6b70",
};

export const DARK_COLORS = {
  foreground: "#fafafa",
  background: "#0a0a0b",
  tabBarBackground: "#1C1C1E",
  tabBarInactive: "#8e8e93",
};

export function getThemedColors(isDark: boolean) {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}
