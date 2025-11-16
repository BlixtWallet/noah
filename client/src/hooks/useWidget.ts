import { useEffect } from "react";
import { Platform } from "react-native";
import { updateWidgetData } from "noah-tools";
import { APP_VARIANT } from "~/config";
import logger from "~/lib/log";
import { getVtxos } from "~/lib/walletApi";
import { getBlockHeight } from "~/hooks/useMarketData";
import { ACTIVE_WALLET_CONFIG } from "~/constants";

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

export async function updateWidget(balanceData: BalanceData): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    const appGroup = getAppGroup();

    // Get closest expiring vtxo
    const vtxosResult = await getVtxos();
    const blockHeightResult = await getBlockHeight();

    let closestExpiryBlocks: number | null = null;

    if (vtxosResult.isOk() && blockHeightResult.isOk()) {
      const vtxos = vtxosResult.value;
      const currentHeight = blockHeightResult.value;

      // Find the vtxo with the closest expiry (including expired ones with negative blocks)
      for (const vtxo of vtxos) {
        const blocksUntilExpiry = vtxo.expiry_height - currentHeight;
        if (closestExpiryBlocks === null || blocksUntilExpiry < closestExpiryBlocks) {
          closestExpiryBlocks = blocksUntilExpiry;
        }
      }
    }

    // If no VTXOs found, use sentinel value -999 to signal widget to hide expiry section
    if (closestExpiryBlocks === null) {
      closestExpiryBlocks = -999;
    }

    const expiryThreshold = ACTIVE_WALLET_CONFIG.config?.vtxo_refresh_expiry_threshold || 288;

    updateWidgetData(
      balanceData.totalBalance,
      balanceData.onchainBalance,
      balanceData.offchainBalance,
      balanceData.pendingBalance,
      closestExpiryBlocks,
      expiryThreshold,
      appGroup,
    );
  } catch (error) {
    log.e("Failed to update widget:", [error]);
  }
}
