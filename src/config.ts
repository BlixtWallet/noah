import { NativeModules } from "react-native";

const AppVariant = NativeModules.AppVariant
  ? NativeModules.AppVariant.getConstants()
  : {};

  console.log("AppVariant", AppVariant);

export const APP_VARIANT = AppVariant.APP_VARIANT;