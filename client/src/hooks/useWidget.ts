import { useEffect } from "react";
import { Platform } from "react-native";
import { saveBalanceForWidget } from "noah-tools";
import { APP_VARIANT } from "~/config";
import logger from "~/lib/log";
const log = logger("useWidget");

interface BalanceData {
  totalBalance: number;
  onchainBalance: number;
  offchainBalance: number;
  pendingBalance: number;
}

const getAppGroup = (): string => {
  const isIOS = Platform.OS === "ios";
  const prefix = isIOS ? "group." : "";

  switch (APP_VARIANT) {
    case "regtest":
      return `${prefix}com.noahwallet.regtest`;
    case "signet":
      return `${prefix}com.noahwallet.signet`;
    case "mainnet":
      return `${prefix}com.noahwallet.mainnet`;
    default:
      return `${prefix}com.noahwallet.regtest`;
  }
};

export function useWidget(balanceData: BalanceData | null) {
  useEffect(() => {
    if (!balanceData) {
      return;
    }

    updateWidget(balanceData);
  }, [balanceData]);
}

export function updateWidget(balanceData: BalanceData): void {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    const appGroup = getAppGroup();
    saveBalanceForWidget(
      balanceData.totalBalance,
      balanceData.onchainBalance,
      balanceData.offchainBalance,
      balanceData.pendingBalance,
      appGroup,
    );
  } catch (error) {
    log.e("Failed to update widget:", [error]);
  }
}
