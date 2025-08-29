import { create } from "zustand";
import type { Transaction } from "../types/transaction";
import {
  getTransactions,
  addTransaction as addTransactionDb,
  removeTransaction as removeTransactionDb,
} from "~/lib/transactionsDb";

interface TransactionState {
  transactions: Transaction[];
  loadTransactions: () => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  reset: () => void;
  deleteAllTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
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
  reset: () => set({ transactions: [] }),
  deleteAllTransactions: () => {
    // TODO: Implement this
  },
}));
