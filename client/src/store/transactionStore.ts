import { MMKV } from "react-native-mmkv";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Transaction } from "../types/transaction";

const storage = new MMKV({
  id: "transaction-storage",
});

const zustandStorage = createJSONStorage(() => ({
  setItem: (name, value) => {
    try {
      return storage.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      if (__DEV__) {
        console.warn("Transaction storage setItem failed:", error);
      }
      return;
    }
  },
  getItem: (name) => {
    try {
      const value = storage.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      if (__DEV__) {
        console.warn("Transaction storage getItem failed:", error);
      }
      return null;
    }
  },
  removeItem: (name) => {
    try {
      return storage.delete(name);
    } catch (error) {
      // Silently fail
      if (__DEV__) {
        console.warn("Transaction storage removeItem failed:", error);
      }
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
      transactions: [],
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
