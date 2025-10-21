import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { mmkv } from "~/lib/mmkv";
import logger from "~/lib/log";

const log = logger("walletStore");

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return mmkv.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      log.e("Wallet storage setItem failed:", [error]);
      return;
    }
  },
  getItem: (name: string) => {
    try {
      const value = mmkv.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      log.e("Wallet storage getItem failed:", [error]);
      return null;
    }
  },
  removeItem: (name: string) => {
    try {
      return mmkv.remove(name);
    } catch (error) {
      // Silently fail
      log.e("Wallet storage removeItem failed:", [error]);
      return;
    }
  },
};

export type RestoreProgress = {
  step: string;
  progress: number;
};

interface WalletState {
  isInitialized: boolean;
  isWalletLoaded: boolean;
  walletError: boolean;
  staticVtxoPubkey: string | null;
  restoreProgress: RestoreProgress | null;
  isBiometricsEnabled: boolean;
  finishOnboarding: () => void;
  setWalletLoaded: () => void;
  setWalletUnloaded: () => void;
  setWalletError: (error: boolean) => void;
  setStaticVtxoPubkey: (pubkey: string) => void;
  setRestoreProgress: (progress: RestoreProgress | null) => void;
  setBiometricsEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const initialState = {
  isInitialized: false,
  isWalletLoaded: false,
  walletError: false,
  staticVtxoPubkey: null,
  restoreProgress: null,
  isBiometricsEnabled: false,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,
      finishOnboarding: () => set({ isInitialized: true, isWalletLoaded: true }),
      setWalletLoaded: () => set({ isWalletLoaded: true, walletError: false }),
      setWalletUnloaded: () => set({ isWalletLoaded: false }),
      setWalletError: (error) => set({ walletError: error }),
      setStaticVtxoPubkey: (pubkey) => set({ staticVtxoPubkey: pubkey }),
      setRestoreProgress: (progress) => set({ restoreProgress: progress }),
      setBiometricsEnabled: (enabled) => set({ isBiometricsEnabled: enabled }),
      reset: () => set(initialState),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        isInitialized: state.isInitialized,
        isWalletLoaded: state.isWalletLoaded,
        staticVtxoPubkey: state.staticVtxoPubkey,
        isBiometricsEnabled: state.isBiometricsEnabled,
      }),
    },
  ),
);
