import TurboSqlite from "react-native-turbo-sqlite";
import { ARK_DATA_PATH } from "../constants";
import { useTransactionStore } from "../store/transactionStore";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
const db = TurboSqlite.openDatabase(`${ARK_DATA_PATH}/db.sqlite`);

const log = logger("useSyncManager");

export const syncArkReceives = async () => {
  const { addTransaction } = useTransactionStore.getState();

  try {
    const receivedTxs = db.executeSql("SELECT id, amount_sat, created_at FROM bark_vtxo", []);

    if (receivedTxs && receivedTxs.rows && receivedTxs.rows.length > 0) {
      for (const tx of receivedTxs.rows) {
        const currentTransactions = useTransactionStore.getState().transactions;
        const existingTx = currentTransactions.find((t) => t.txid === tx.id);

        if (!existingTx) {
          log.d(`Syncing new Ark transaction from sqlite: ${tx.id}`, [tx]);

          const btcPrice = await getHistoricalBtcToUsdRate(tx.created_at);
          const newTransaction: Transaction = {
            id: uuid.v4().toString(),
            txid: tx.id,
            amount: tx.amount_sat,
            date: new Date(tx.created_at).toISOString(),
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
  } catch (error) {
    console.error("Failed to sync transactions from SQLite:", error);
  }
};
