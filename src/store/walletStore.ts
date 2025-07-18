import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import { ACTIVE_WALLET_CONFIG } from "../constants";
import { APP_VARIANT } from "../config";

const storage = new MMKV();

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    return storage.set(name, value);
  },
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => {
    return storage.delete(name);
  },
};

export type WalletConfig = {
  bitcoind?: string;
  asp?: string;
  esplora?: string;
  bitcoind_user?: string;
  bitcoind_pass?: string;
};

const initialConfig = () => {
  if (!ACTIVE_WALLET_CONFIG.config) {
    return {};
  }
  if (APP_VARIANT === "regtest") {
    return {
      bitcoind: ACTIVE_WALLET_CONFIG.config.bitcoind,
      asp: ACTIVE_WALLET_CONFIG.config.asp,
      bitcoind_user: ACTIVE_WALLET_CONFIG.config.bitcoind_user,
      bitcoind_pass: ACTIVE_WALLET_CONFIG.config.bitcoind_pass,
    };
  }
  return {
    esplora: ACTIVE_WALLET_CONFIG.config.esplora,
    asp: ACTIVE_WALLET_CONFIG.config.asp,
  };
};

interface WalletState {
  isInitialized: boolean;
  isWalletLoaded: boolean;
  config: WalletConfig;
  finishOnboarding: () => void;
  setWalletLoaded: () => void;
  setWalletUnloaded: () => void;
  setConfig: (config: WalletConfig) => void;
  reset: () => void;
}

const initialState = {
  isInitialized: false,
  isWalletLoaded: false,
  config: initialConfig(),
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,
      finishOnboarding: () => set({ isInitialized: true, isWalletLoaded: true }),
      setWalletLoaded: () => set({ isWalletLoaded: true }),
      setWalletUnloaded: () => set({ isWalletLoaded: false }),
      setConfig: (config) => set({ config }),
      reset: () => set(initialState),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([key]) => !["isWalletLoaded"].includes(key)),
        ),
    },
  ),
);
