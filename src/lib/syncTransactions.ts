import { ARK_DATA_PATH } from "../constants";
import { useTransactionStore } from "../store/transactionStore";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
import * as SQLite from "expo-sqlite";

const log = logger("useSyncManager");

type ReceivedVtxos = {
  id: string;
  amount_sat: number;
  created_at: number;
};

export const syncArkReceives = async () => {
  const db = await SQLite.openDatabaseAsync("db.sqlite", { useNewConnection: true }, ARK_DATA_PATH);
  const { addTransaction } = useTransactionStore.getState();

  try {
    const rows = await db.getAllAsync<ReceivedVtxos>(
      `SELECT id, amount_sat, created_at FROM bark_vtxo;`,
    );

    if (rows && rows.length > 0) {
      const currentTransactions = useTransactionStore.getState().transactions;

      for (const tx of rows) {
        const existingTx = currentTransactions.find((t) => t.txid === (tx.id as string));

        if (!existingTx) {
          log.d(`Syncing new Ark transaction from sqlite: ${tx.id as string}`, [tx]);

          const btcPrice = await getHistoricalBtcToUsdRate(String(tx.created_at));
          const newTransaction: Transaction = {
            id: uuid.v4().toString(),
            txid: tx.id as string,
            amount: tx.amount_sat as number,
            date: new Date(tx.created_at as number).toISOString(),
            direction: "incoming",
            type: "Arkoor",
            btcPrice: btcPrice,
            description: "",
            destination: "",
          };
          addTransaction(newTransaction);
        }
      }
    }

    log.d("Successfully synced Ark transactions from SQLite");
    db.closeSync();
  } catch (error) {
    db.closeSync();
    console.error("Failed to sync transactions from SQLite:", error);
  }
};
