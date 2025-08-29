import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Transaction } from "../types/transaction";
import { mmkv } from "~/lib/mmkv";

const zustandStorage = createJSONStorage(() => ({
  setItem: (name, value) => {
    try {
      return mmkv.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      console.warn("Transaction storage setItem failed:", error);
      return;
    }
  },
  getItem: (name) => {
    try {
      const value = mmkv.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      console.warn("Transaction storage getItem failed:", error);
      return null;
    }
  },
  removeItem: (name) => {
    try {
      return mmkv.delete(name);
    } catch (error) {
      // Silently fail
      console.warn("Transaction storage removeItem failed:", error);
      return;
    }
  },
}));

interface TransactionState {
  transactions: Transaction[];
  addTransaction: (transaction: Transaction) => void;
  removeTransaction: (id: string) => void;
  reset: () => void;
  deleteAllTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      transactions: __DEV__
        ? [
            {
              id: "1",
              type: "Onchain",
              direction: "incoming",
              amount: 1000,
              date: new Date(Date.now() - 3600 * 1000).toISOString(),
              description: "Received from test",
            },
            {
              id: "2",
              type: "Bolt11",
              direction: "outgoing",
              amount: 500,
              date: new Date(Date.now() - 7200 * 1000).toISOString(),
              description: "Sent to test",
            },
          ]
        : [],
      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [transaction, ...state.transactions],
        })),
      removeTransaction: (id: string) =>
        set((state) => ({
          transactions: state.transactions.filter((transaction) => transaction.id !== id),
        })),
      reset: () => set({ transactions: [] }),
      deleteAllTransactions: () => set({ transactions: [] }),
    }),
    {
      name: "transaction-storage",
      storage: zustandStorage,
    },
  ),
);
