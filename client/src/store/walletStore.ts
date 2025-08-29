import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import { APP_VARIANT } from "../config";
import { ACTIVE_WALLET_CONFIG } from "~/constants";

const storage = new MMKV();

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return storage.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      if (__DEV__) {
        console.warn("Wallet storage setItem failed:", error);
      }
      return;
    }
  },
  getItem: (name: string) => {
    try {
      const value = storage.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      if (__DEV__) {
        console.warn("Wallet storage getItem failed:", error);
      }
      return null;
    }
  },
  removeItem: (name: string) => {
    try {
      return storage.delete(name);
    } catch (error) {
      // Silently fail
      if (__DEV__) {
        console.warn("Wallet storage removeItem failed:", error);
      }
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

interface WalletState {
  isInitialized: boolean;
  isWalletLoaded: boolean;
  walletError: boolean;
  config: WalletConfig;
  finishOnboarding: () => void;
  setWalletLoaded: () => void;
  setWalletUnloaded: () => void;
  setWalletError: (error: boolean) => void;
  setConfig: (config: WalletConfig) => void;
  setStaticVtxoPubkey: (pubkey: string) => void;
  reset: () => void;
}

const initialState = {
  isInitialized: false,
  isWalletLoaded: false,
  walletError: false,
  config: initialConfig(),
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
