import { NativeModules } from "react-native";

type AppVariantConstants = {
  APP_VARIANT: "mainnet" | "signet" | "regtest";
};

const AppVariant = (
  NativeModules.AppVariant ? NativeModules.AppVariant.getConstants() : {}
) as Partial<AppVariantConstants>;

export const APP_VARIANT: AppVariantConstants["APP_VARIANT"] =
  AppVariant.APP_VARIANT ?? "signet";
