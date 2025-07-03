import type { HybridObject } from "react-native-nitro-modules";

export interface NoahTools extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  getAppVariant(): string;
}
