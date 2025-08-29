import * as SQLite from "expo-sqlite";
import { ResultAsync } from "neverthrow";
import { Transaction } from "~/types/transaction";
import logger from "./log";
import { ARK_DATA_PATH } from "~/constants";

const log = logger("transactionsDb");

let db: SQLite.SQLiteDatabase | null = null;

export const openDatabase = async () => {
  if (db) {
    return db;
  }
  const newDb = await SQLite.openDatabaseAsync("noah_wallet.sqlite", {}, ARK_DATA_PATH);
  await newDb.execAsync("PRAGMA journal_mode = WAL;");

  const migrations = [
    `
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        txid TEXT,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount INTEGER NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        destination TEXT,
        btcPrice REAL
      );
    `,
    // In the future, add new migrations here. For example:
    // `ALTER TABLE transactions ADD COLUMN new_column TEXT;`,
  ];

  await newDb.withTransactionAsync(async () => {
    const result = await newDb.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    let version = result?.user_version ?? 0;

    if (version < migrations.length) {
      for (let i = version; i < migrations.length; i++) {
        await newDb.execAsync(migrations[i]);
        const newVersion = i + 1;
        await newDb.execAsync(`PRAGMA user_version = ${newVersion}`);
        log.i(`Database migrated to version ${newVersion}`);
      }
    }
  });

  db = newDb;
  return db;
};

export const addTransaction = async (transaction: Transaction) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      `INSERT INTO transactions (id, txid, type, direction, amount, date, description, destination, btcPrice)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      transaction.id,
      transaction.txid || null,
      transaction.type,
      transaction.direction,
      transaction.amount,
      transaction.date,
      transaction.description || null,
      transaction.destination || null,
      transaction.btcPrice || null,
    ),
    (e) => {
      log.e("Failed to add transaction", [e]);
      return e as Error;
    },
  );
};

export const getTransactions = async (): Promise<ResultAsync<Transaction[], Error>> => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.getAllAsync<Transaction>("SELECT * FROM transactions ORDER BY date DESC;"),
    (e) => {
      log.e("Failed to get transactions", [e]);
      return e as Error;
    },
  );
};

export const removeTransaction = async (id: string) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(db.runAsync("DELETE FROM transactions WHERE id = ?;", id), (e) => {
    log.e("Failed to remove transaction", [e]);
    return e as Error;
  });
};
