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
  switch (APP_VARIANT) {
    case "regtest":
      return "group.com.noahwallet.regtest";
    case "signet":
      return "group.com.noahwallet.signet";
    case "mainnet":
      return "group.com.noahwallet.mainnet";
    default:
      return "group.com.noahwallet.regtest";
  }
};

export function useWidget(balanceData: BalanceData | null) {
  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    if (!balanceData) {
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
  }, [balanceData]);
}

export function updateWidget(balanceData: BalanceData): void {
  if (Platform.OS !== "ios") {
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
