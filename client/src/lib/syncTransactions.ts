import { ARK_DATA_PATH } from "../constants";
import { useTransactionStore } from "~/store/transactionStore";
import { addTransaction, getTransactions } from "./transactionsDb";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
import * as SQLite from "expo-sqlite";
import { ResultAsync } from "neverthrow";

const txIdFromOutpoint = (outpoint: string): string => outpoint.split(":")[0];

const log = logger("useSyncManager");

type ReceivedVtxos = {
  id: string;
  amount_sat: number;
  created_at: string;
};

export const syncArkReceives = async () => {
  const db = await SQLite.openDatabaseAsync("db.sqlite", { useNewConnection: true }, ARK_DATA_PATH);
  const rowsResult = await ResultAsync.fromPromise(
    db.getAllAsync<ReceivedVtxos>(
      `SELECT id, amount_sat, created_at FROM bark_vtxo WHERE received_in NOT IN (SELECT DISTINCT spent_in FROM bark_vtxo WHERE spent_in IS NOT NULL);`,
    ),
    (e) => e as Error,
  );

  if (rowsResult.isErr()) {
    db.closeSync();
    log.e("Failed to sync transactions from SQLite:", [rowsResult.error]);
    return;
  }

  const rows = rowsResult.value;

  if (rows && rows.length > 0) {
    const currentTransactionsResult = await getTransactions();
    if (currentTransactionsResult.isErr()) {
      log.w("Could not get current transactions", [currentTransactionsResult.error]);
      return;
    }
    const currentTransactions = currentTransactionsResult.value.filter(
      (tx) => tx.type === "Arkoor",
    );

    for (const tx of rows) {
      const existingTx = currentTransactions.find(
        (t) => t.txid && txIdFromOutpoint(t.txid) === txIdFromOutpoint(tx.id),
      );

      if (!existingTx) {
        log.d(`Syncing new Ark transaction from sqlite: ${tx.id}`, [tx]);

        const btcPriceResult = await getHistoricalBtcToUsdRate(
          new Date(tx.created_at + "Z").toISOString(),
        );
        if (btcPriceResult.isErr()) {
          log.w("Could not get historical BTC price", [btcPriceResult.error]);
          continue;
        }
        const newTransaction: Transaction = {
          id: uuid.v4().toString(),
          txid: tx.id as string,
          amount: tx.amount_sat as number,
          date: new Date(tx.created_at + "Z").toISOString(),
          direction: "incoming",
          type: "Arkoor",
          btcPrice: btcPriceResult.value,
          description: "",
          destination: "",
        };
        await addTransaction(newTransaction);
      }
    }
  }

  log.d("Successfully synced Ark transactions from SQLite");
  useTransactionStore.getState().loadTransactions();
  db.closeSync();
};
