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
    `
      CREATE TABLE IF NOT EXISTS offboarding_requests (
        request_id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `,
    // In the future, add new migrations here. For example:
    // `ALTER TABLE transactions ADD COLUMN new_column TEXT;`,
  ];

  await newDb.withTransactionAsync(async () => {
    const result = await newDb.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    const version = result?.user_version ?? 0;

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

// Offboarding request functions
export type OffboardingRequest = {
  request_id: string;
  date: string;
  status: "pending" | "completed" | "failed";
};

export const addOffboardingRequest = async (request: OffboardingRequest) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      `INSERT INTO offboarding_requests (request_id, date, status)
       VALUES (?, ?, ?);`,
      request.request_id,
      request.date,
      request.status,
    ),
    (e) => {
      log.e("Failed to add offboarding request", [e]);
      return e as Error;
    },
  );
};

export const getOffboardingRequests = async (): Promise<
  ResultAsync<OffboardingRequest[], Error>
> => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.getAllAsync<OffboardingRequest>("SELECT * FROM offboarding_requests ORDER BY date DESC;"),
    (e) => {
      log.e("Failed to get offboarding requests", [e]);
      return e as Error;
    },
  );
};

export const updateOffboardingRequestStatus = async (requestId: string, status: string) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      "UPDATE offboarding_requests SET status = ? WHERE request_id = ?;",
      status,
      requestId,
    ),
    (e) => {
      log.e("Failed to update offboarding request status", [e]);
      return e as Error;
    },
  );
};
