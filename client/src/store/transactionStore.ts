import { create } from "zustand";
import type { Transaction } from "../types/transaction";
import { getTransactions, addTransaction as addTransactionDb } from "~/lib/transactionsDb";

interface TransactionState {
  transactions: Transaction[];
  loadTransactions: () => Promise<void>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  removeTransaction: (id: string) => void;
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
  removeTransaction: (id: string) => {
    // TODO: Implement this
  },
  reset: () => set({ transactions: [] }),
  deleteAllTransactions: () => {
    // TODO: Implement this
  },
}));
