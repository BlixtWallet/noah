import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { mmkv } from "~/lib/mmkv";
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
  isAutoBoardingEnabled: boolean;
  hasAttemptedAutoBoarding: boolean;
  setAutoBoardingEnabled: (enabled: boolean) => void;
  setHasAttemptedAutoBoarding: (attempted: boolean) => void;
  reset: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      isAutoBoardingEnabled: true,
      hasAttemptedAutoBoarding: false,
      setAutoBoardingEnabled: (enabled: boolean) => set({ isAutoBoardingEnabled: enabled }),
      setHasAttemptedAutoBoarding: (attempted: boolean) =>
        set({ hasAttemptedAutoBoarding: attempted }),
      reset: () =>
        set({
          isAutoBoardingEnabled: true,
          hasAttemptedAutoBoarding: false,
        }),
    }),
    {
      name: "transaction-storage",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
