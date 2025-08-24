import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import { APP_VARIANT } from "../config";
import { BackupService } from "~/lib/backupService";
import { ARK_DATA_PATH, DOCUMENT_DIRECTORY_PATH, ACTIVE_WALLET_CONFIG } from "~/constants";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { loadWalletIfNeeded } from "~/lib/walletApi";

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
  staticVtxoPubkey: string;
};

const initialConfig = (): WalletConfig => {
  const baseConfig: WalletConfig = {
    staticVtxoPubkey: "",
  };

  if (!ACTIVE_WALLET_CONFIG.config) {
    return baseConfig;
  }

  if (APP_VARIANT === "regtest") {
    return {
      ...baseConfig,
      bitcoind: ACTIVE_WALLET_CONFIG.config.bitcoind,
      asp: ACTIVE_WALLET_CONFIG.config.asp,
      bitcoind_user: ACTIVE_WALLET_CONFIG.config.bitcoind_user,
      bitcoind_pass: ACTIVE_WALLET_CONFIG.config.bitcoind_pass,
    };
  }

  return {
    ...baseConfig,
    esplora: ACTIVE_WALLET_CONFIG.config.esplora,
    asp: ACTIVE_WALLET_CONFIG.config.asp,
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
  restoreWallet: (seedPhrase: string) => Promise<void>;
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
      restoreWallet: async (seedPhrase) => {
        const backupService = new BackupService();
        const restoreResult = await backupService.restoreBackup(seedPhrase);

        if (restoreResult.isErr()) {
          console.error("Failed to restore backup", restoreResult.error);
          return;
        }

        const unzippedPath = restoreResult.value;
        const mmkvSourcePath = `${unzippedPath}/mmkv`;
        const dbSourcePath = `${unzippedPath}/noah-data-${APP_VARIANT}/db.sqlite`;

        const mmkvDestPath = `${DOCUMENT_DIRECTORY_PATH}/mmkv`;
        const dbDestPath = `${ARK_DATA_PATH}/db.sqlite`;

        try {
          await RNFS.mkdir(ARK_DATA_PATH);
          await RNFS.moveFile(mmkvSourcePath, mmkvDestPath);
          await RNFS.moveFile(dbSourcePath, dbDestPath);
          await loadWalletIfNeeded();
          set({ isInitialized: true, isWalletLoaded: true });
        } catch (e) {
          console.error("Failed to move restored files", e);
        }
      },
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
