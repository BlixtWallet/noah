import { queryClient } from "~/queryClient";
import { useWalletStore } from "~/store/walletStore";
import { maintanance, onchainSync, sync } from "~/lib/walletApi";
import { syncArkReceives } from "~/lib/syncTransactions";
import logger from "~/lib/log";

const log = logger("sync");

export const syncWallet = async () => {
  const { isInitialized, isWalletLoaded } = useWalletStore.getState();

  if (!isInitialized || !isWalletLoaded) {
    return;
  }

  log.i("syncWallet");

  const results = await Promise.allSettled([sync(), onchainSync(), maintanance()]);
  results.forEach((result) => {
    if (result.status === "rejected") {
      log.e("background sync failed:", [result.reason]);
    }
  });
  await syncArkReceives();
  await queryClient.invalidateQueries({ queryKey: ["balance"] });
};
