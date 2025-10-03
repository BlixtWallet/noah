import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { APP_VARIANT } from "../config";
import { ACTIVE_WALLET_CONFIG } from "~/constants";
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

export type WalletConfig = {
  bitcoind?: string;
  ark?: string;
  esplora?: string;
  bitcoind_user?: string;
  bitcoind_pass?: string;
  staticVtxoPubkey?: string;
};

const initialConfig = (): WalletConfig => {
  if (!ACTIVE_WALLET_CONFIG.config) return {};

  if (APP_VARIANT === "regtest") {
    return {
      bitcoind: ACTIVE_WALLET_CONFIG.config.bitcoind,
      ark: ACTIVE_WALLET_CONFIG.config.ark,
      bitcoind_user: ACTIVE_WALLET_CONFIG.config.bitcoind_user,
      bitcoind_pass: ACTIVE_WALLET_CONFIG.config.bitcoind_pass,
    };
  }

  return {
    esplora: ACTIVE_WALLET_CONFIG.config.esplora,
    ark: ACTIVE_WALLET_CONFIG.config.ark,
  };
};

export type RestoreProgress = {
  step: string;
  progress: number;
};

interface WalletState {
  isInitialized: boolean;
  isWalletLoaded: boolean;
  walletError: boolean;
  config: WalletConfig;
  restoreProgress: RestoreProgress | null;
  finishOnboarding: () => void;
  setWalletLoaded: () => void;
  setWalletUnloaded: () => void;
  setWalletError: (error: boolean) => void;
  setConfig: (config: WalletConfig) => void;
  setStaticVtxoPubkey: (pubkey: string) => void;
  setRestoreProgress: (progress: RestoreProgress | null) => void;
  reset: () => void;
}

const initialState = {
  isInitialized: false,
  isWalletLoaded: false,
  walletError: false,
  config: initialConfig(),
  restoreProgress: null,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,
      finishOnboarding: () => set({ isInitialized: true, isWalletLoaded: true }),
      setWalletLoaded: () => set({ isWalletLoaded: true, walletError: false }),
      setWalletUnloaded: () => set({ isWalletLoaded: false }),
      setWalletError: (error) => set({ walletError: error }),
      setConfig: (config) => set({ config }),
      setStaticVtxoPubkey: (pubkey) =>
        set((state) => ({ config: { ...state.config, staticVtxoPubkey: pubkey } })),
      setRestoreProgress: (progress) => set({ restoreProgress: progress }),
      reset: () => set(initialState),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        isInitialized: state.isInitialized,
        isWalletLoaded: state.isWalletLoaded,
        config: state.config,
      }),
    },
  ),
);
