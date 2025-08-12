import { queryClient } from "App";
import { useWalletStore } from "~/store/walletStore";
import { onchainSync, sync } from "~/lib/walletApi";
import { syncArkReceives } from "~/lib/syncTransactions";
import logger from "~/lib/log";

const log = logger("sync");

export const syncWallet = async () => {
  const { isInitialized, isWalletLoaded } = useWalletStore.getState();

  if (!isInitialized || !isWalletLoaded) {
    return;
  }

  log.i("syncWallet");

  try {
    await Promise.allSettled([sync(), onchainSync()]);
    await syncArkReceives();
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
  } catch (error) {
    log.e("background sync failed:", [error]);
  }
};
