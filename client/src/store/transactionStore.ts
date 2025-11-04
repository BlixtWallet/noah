import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { mmkv } from "~/lib/mmkv";
import type { Transaction } from "../types/transaction";
import {
  getTransactions,
  addTransaction as addTransactionDb,
  removeTransaction as removeTransactionDb,
} from "~/lib/transactionsDb";
import logger from "~/lib/log";

const log = logger("transactionStore");

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return mmkv.set(name, value);
    } catch (error) {
      log.w("Transaction storage setItem failed:", [error]);
      return;
    }
  },
  getItem: (name: string) => {
    try {
      const value = mmkv.getString(name);
      return value ?? null;
    } catch (error) {
      log.w("Transaction storage getItem failed:", [error]);
      return null;
    }
  },
  removeItem: (name: string) => {
    try {
      return mmkv.remove(name);
    } catch (error) {
      log.w("Transaction storage removeItem failed:", [error]);
      return;
    }
  },
};

interface TransactionState {
  transactions: Transaction[];
  isAutoBoardingEnabled: boolean;
  hasAttemptedAutoBoarding: boolean;
  loadTransactions: () => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  setAutoBoardingEnabled: (enabled: boolean) => void;
  setHasAttemptedAutoBoarding: (attempted: boolean) => void;
  reset: () => void;
  deleteAllTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      transactions: [],
      isAutoBoardingEnabled: true,
      hasAttemptedAutoBoarding: false,
      loadTransactions: async () => {
        const result = await getTransactions();
        if (result.isOk()) {
          set({ transactions: result.value });
        }
      },
      addTransaction: async (transaction) => {
        await addTransactionDb(transaction);
        set((state) => ({
          transactions: [transaction, ...state.transactions],
        }));
      },
      removeTransaction: async (id: string) => {
        const result = await removeTransactionDb(id);
        if (result.isOk()) {
          set((state) => ({
            transactions: state.transactions.filter((tx) => tx.id !== id),
          }));
        }
      },
      setAutoBoardingEnabled: (enabled: boolean) => set({ isAutoBoardingEnabled: enabled }),
      setHasAttemptedAutoBoarding: (attempted: boolean) =>
        set({ hasAttemptedAutoBoarding: attempted }),
      reset: () => set({ transactions: [] }),
      deleteAllTransactions: () => {
        // TODO: Implement this
      },
    }),
    {
      name: "transaction-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        isAutoBoardingEnabled: state.isAutoBoardingEnabled,
        hasAttemptedAutoBoarding: state.hasAttemptedAutoBoarding,
      }),
    },
  ),
);
