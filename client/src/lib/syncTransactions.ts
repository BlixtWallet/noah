import { useTransactionStore } from "~/store/transactionStore";
import { addTransaction, getTransactions } from "./transactionsDb";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
import { movements } from "./paymentsApi";

const log = logger("useSyncManager");

export const syncArkReceives = async () => {
  const movementsResult = await movements();

  if (movementsResult.isErr()) {
    log.e("Failed to fetch movements:", [movementsResult.error]);
    return;
  }

  const allMovements = movementsResult.value;
  const relevantMovements = allMovements.filter(
    (m) =>
      m.kind === "arkoor-receive" ||
      m.kind === "onboard" ||
      m.kind === "offboard" ||
      m.kind === "exit",
  );

  if (relevantMovements.length === 0) {
    log.d("No relevant transactions found");
    useTransactionStore.getState().loadTransactions();
    return;
  }

  const currentTransactionsResult = await getTransactions();
  if (currentTransactionsResult.isErr()) {
    log.w("Could not get current transactions", [currentTransactionsResult.error]);
    return;
  }

  const currentTransactions = currentTransactionsResult.value;

  for (const movement of relevantMovements) {
    const isIncoming = movement.kind === "arkoor-receive" || movement.kind === "onboard";

    // Use VTXO point as unique identifier instead of sequential ID
    let uniqueId: string;
    if (isIncoming && movement.receives.length > 0) {
      uniqueId = movement.receives[0].point;
    } else if (movement.spends.length > 0) {
      uniqueId = movement.spends[0].point;
    } else {
      log.w(`Movement ${movement.id} has no VTXOs, skipping`, [movement]);
      continue;
    }

    const existingTx = currentTransactions.find((t) => t.txid === uniqueId);

    if (!existingTx) {
      const isArkoor = movement.kind === "arkoor-receive";

      let transactionType: Transaction["type"];
      if (isArkoor) {
        transactionType = "Arkoor";
      } else {
        transactionType = "Onchain";
      }

      let totalAmount: number;
      if (isIncoming) {
        totalAmount = movement.receives.reduce((sum, vtxo) => sum + vtxo.amount, 0);
      } else {
        totalAmount = movement.recipients.reduce((sum, recipient) => sum + recipient.amount_sat, 0);
      }

      log.d(`Syncing new ${movement.kind} transaction: ${movement.id}`, [movement]);

      const btcPriceResult = await getHistoricalBtcToUsdRate(
        new Date(movement.created_at + "Z").toISOString(),
      );
      if (btcPriceResult.isErr()) {
        log.w("Could not get historical BTC price", [btcPriceResult.error]);
        continue;
      }

      const newTransaction: Transaction = {
        id: uuid.v4().toString(),
        txid: uniqueId,
        amount: totalAmount,
        date: new Date(movement.created_at + "Z").toISOString(),
        direction: isIncoming ? "incoming" : "outgoing",
        type: transactionType,
        btcPrice: btcPriceResult.value,
        description: "",
        destination: "",
      };

      await addTransaction(newTransaction);
    }
  }

  log.d("Successfully synced transactions from movements API");
  useTransactionStore.getState().loadTransactions();
};
