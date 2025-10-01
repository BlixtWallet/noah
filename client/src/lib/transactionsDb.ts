import * as SQLite from "expo-sqlite";
import { ResultAsync } from "neverthrow";
import { Transaction } from "~/types/transaction";
import logger from "./log";
import { ARK_DATA_PATH } from "~/constants";
import { runMigrations } from "./migrations";

const log = logger("transactionsDb");

let db: SQLite.SQLiteDatabase | null = null;

export const openDatabase = async () => {
  if (db) {
    return db;
  }
  const newDb = await SQLite.openDatabaseAsync("noah_wallet.sqlite", {}, ARK_DATA_PATH);
  await newDb.execAsync("PRAGMA journal_mode = WAL;");

  await runMigrations(newDb);

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
  onchain_txid?: string;
};

// Onboarding request functions
export type OnboardingRequest = {
  request_id: string;
  date: string;
  status: "pending" | "completed" | "failed";
  onchain_txid?: string;
};

export const addOffboardingRequest = async (request: OffboardingRequest) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      `INSERT INTO offboarding_requests (request_id, date, status, onchain_txid)
       VALUES (?, ?, ?, ?);`,
      request.request_id,
      request.date,
      request.status,
      request.onchain_txid || null,
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

export const addOnboardingRequest = async (request: OnboardingRequest) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      `INSERT INTO onboarding_requests (request_id, date, status, onchain_txid)
       VALUES (?, ?, ?, ?);`,
      request.request_id,
      request.date,
      request.status,
      request.onchain_txid || null,
    ),
    (e) => {
      log.e("Failed to add onboarding request", [e]);
      return e as Error;
    },
  );
};

export const getOnboardingRequests = async (): Promise<ResultAsync<OnboardingRequest[], Error>> => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.getAllAsync<OnboardingRequest>("SELECT * FROM onboarding_requests ORDER BY date DESC;"),
    (e) => {
      log.e("Failed to get onboarding requests", [e]);
      return e as Error;
    },
  );
};

export const updateOnboardingRequestStatus = async (
  requestId: string,
  status: OnboardingRequest["status"],
  onchainTxid?: string,
) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      "UPDATE onboarding_requests SET status = ?, onchain_txid = ? WHERE request_id = ?;",
      status,
      onchainTxid || null,
      requestId,
    ),
    (e) => {
      log.e("Failed to update onboarding request status", [e]);
      return e as Error;
    },
  );
};

export const updateOffboardingRequestStatus = async (
  requestId: string,
  status: OffboardingRequest["status"],
  onchainTxid?: string,
) => {
  const db = await openDatabase();
  return ResultAsync.fromPromise(
    db.runAsync(
      "UPDATE offboarding_requests SET status = ?, onchain_txid = ? WHERE request_id = ?;",
      status,
      onchainTxid || null,
      requestId,
    ),
    (e) => {
      log.e("Failed to update offboarding request status", [e]);
      return e as Error;
    },
  );
};
