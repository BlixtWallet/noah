import { MMKV } from "react-native-mmkv";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Transaction } from "../types/transaction";

const storage = new MMKV({
  id: "transaction-storage",
});

const zustandStorage = createJSONStorage(() => ({
  setItem: (name, value) => {
    return storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.delete(name);
  },
}));

interface TransactionState {
  transactions: Transaction[];
  addTransaction: (transaction: Transaction) => void;
  reset: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      transactions: [],
      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [transaction, ...state.transactions],
        })),
      reset: () => set({ transactions: [] }),
    }),
    {
      name: "transaction-storage",
      storage: zustandStorage,
    },
  ),
);
