import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

const storage = new MMKV({
  id: "server-storage",
});

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return storage.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      if (__DEV__) {
        console.warn("Server storage setItem failed:", error);
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
        console.warn("Server storage getItem failed:", error);
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
        console.warn("Server storage removeItem failed:", error);
      }
      return;
    }
  },
};

interface ServerState {
  isRegisteredWithServer: boolean;
  lightningAddress: string | null;
  isBackupEnabled: boolean;
  setRegisteredWithServer: (isRegistered: boolean, lightningAddress: string | null) => void;
  setLightningAddress: (lightningAddress: string) => void;
  setBackupEnabled: (enabled: boolean) => void;
  resetRegistration: () => void;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      isRegisteredWithServer: false,
      lightningAddress: null,
      isBackupEnabled: false,
      setRegisteredWithServer: (isRegistered, lightningAddress) =>
        set({ isRegisteredWithServer: isRegistered, lightningAddress }),
      setLightningAddress: (lightningAddress) => set({ lightningAddress }),
      setBackupEnabled: (enabled) => set({ isBackupEnabled: enabled }),
      resetRegistration: () =>
        set({ isRegisteredWithServer: false, lightningAddress: null, isBackupEnabled: false }),
    }),
    {
      name: "server-storage",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
