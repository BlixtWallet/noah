import * as SQLite from "expo-sqlite";
import logger from "./log";

const log = logger("migrations");

type Migration = {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: "create_transactions_table",
    up: migration_v1_create_transactions,
  },
  {
    version: 2,
    name: "create_offboarding_requests_table",
    up: migration_v2_create_offboarding_requests,
  },
  {
    version: 3,
    name: "add_onchain_txid_to_offboarding_requests",
    up: migration_v3_add_onchain_txid_to_offboarding_requests,
  },
  {
    version: 4,
    name: "create_onboarding_requests_table",
    up: migration_v4_create_onboarding_requests,
  },
  {
    version: 5,
    name: "add_preimage_to_transactions",
    up: migration_v5_add_preimage_to_transactions,
  },
];

export const runMigrations = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.withTransactionAsync(async () => {
    const result = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    const currentVersion = result?.user_version ?? 0;

    log.i(`Current database version: ${currentVersion}`);

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        log.i(`Running migration v${migration.version}: ${migration.name}`);
        await migration.up(db);
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        log.i(`Migration v${migration.version} completed`);
      }
    }

    log.i("All migrations completed");
  });
};

async function migration_v1_create_transactions(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
  `);
}

async function migration_v2_create_offboarding_requests(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS offboarding_requests (
      request_id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
}

async function migration_v3_add_onchain_txid_to_offboarding_requests(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.execAsync(`
    ALTER TABLE offboarding_requests ADD COLUMN onchain_txid TEXT;
  `);
}

async function migration_v4_create_onboarding_requests(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS onboarding_requests (
      request_id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      onchain_txid TEXT
    );
  `);
}

async function migration_v5_add_preimage_to_transactions(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE transactions ADD COLUMN preimage TEXT;
  `);
}
