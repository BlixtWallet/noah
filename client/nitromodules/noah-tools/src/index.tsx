import { NitroModules } from "react-native-nitro-modules";
import type { NoahTools } from "./NoahTools.nitro";

const NoahToolsHybridObject = NitroModules.createHybridObject<NoahTools>("NoahTools");

export function getAppVariant(): "mainnet" | "signet" | "regtest" {
  return NoahToolsHybridObject.getAppVariant() as "mainnet" | "signet" | "regtest";
}

export function getAppLogs(): Promise<string[]> {
  return NoahToolsHybridObject.getAppLogs();
}
