import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import { ACTIVE_WALLET_CONFIG } from "../constants";
import { APP_VARIANT } from "../config";

const storage = new MMKV();

const zustandStorage = {
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
  mnemonic: string | null;
  isInitialized: boolean;
  config: WalletConfig;
  setMnemonic: (mnemonic: string) => void;
  finishOnboarding: () => void;
  setConfig: (config: WalletConfig) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      mnemonic: null,
      isInitialized: false,
      config: initialConfig(),
      setMnemonic: (mnemonic) => set({ mnemonic, isInitialized: true }),
      finishOnboarding: () => set({ isInitialized: true }),
      setConfig: (config) => set({ config }),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
