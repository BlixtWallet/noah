import { useTransactionStore } from "~/store/transactionStore";
import { addTransaction, getTransactions } from "./transactionsDb";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
import { movements } from "./paymentsApi";

const log = logger("useSyncManager");

export const syncArkReceives = async () => {
  const movementsResult = await movements(0, 100);

  if (movementsResult.isErr()) {
    log.e("Failed to fetch movements:", [movementsResult.error]);
    return;
  }

  const allMovements = movementsResult.value;
  const arkoorReceives = allMovements.filter((m) => m.kind === "arkoor-receive");

  if (arkoorReceives.length === 0) {
    log.d("No Arkoor receives found");
    useTransactionStore.getState().loadTransactions();
    return;
  }

  const currentTransactionsResult = await getTransactions();
  if (currentTransactionsResult.isErr()) {
    log.w("Could not get current transactions", [currentTransactionsResult.error]);
    return;
  }

  const currentTransactions = currentTransactionsResult.value.filter((tx) => tx.type === "Arkoor");

  for (const movement of arkoorReceives) {
    const movementIdString = movement.id.toString();
    const existingTx = currentTransactions.find((t) => t.txid === movementIdString);

    if (!existingTx) {
      log.d(`Syncing new Arkoor receive from movements: ${movement.id}`, [movement]);

      const totalAmount = movement.receives.reduce((sum, vtxo) => sum + vtxo.amount, 0);

      const btcPriceResult = await getHistoricalBtcToUsdRate(
        new Date(movement.created_at + "Z").toISOString(),
      );
      if (btcPriceResult.isErr()) {
        log.w("Could not get historical BTC price", [btcPriceResult.error]);
        continue;
      }

      const newTransaction: Transaction = {
        id: uuid.v4().toString(),
        txid: movementIdString,
        amount: totalAmount,
        date: new Date(movement.created_at + "Z").toISOString(),
        direction: "incoming",
        type: "Arkoor",
        btcPrice: btcPriceResult.value,
        description: "",
        destination: "",
      };

      await addTransaction(newTransaction);
    }
  }

  log.d("Successfully synced Arkoor receives from movements API");
  useTransactionStore.getState().loadTransactions();
};
