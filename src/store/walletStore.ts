import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

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

interface WalletState {
  mnemonic: string | null;
  isInitialized: boolean;
  setMnemonic: (mnemonic: string) => void;
  finishOnboarding: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      mnemonic: null,
      isInitialized: false,
      setMnemonic: (mnemonic) => set({ mnemonic, isInitialized: true }),
      finishOnboarding: () => set({ isInitialized: true }),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
