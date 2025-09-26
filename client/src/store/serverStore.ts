import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { mmkv } from "~/lib/mmkv";
import logger from "~/lib/log";

const log = logger("serverStore");

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return mmkv.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      // Only log in development
      log.w("Server storage setItem failed:", [error]);
      return;
    }
  },
  getItem: (name: string) => {
    try {
      const value = mmkv.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      log.w("Server storage getItem failed:", [error]);
      return null;
    }
  },
  removeItem: (name: string) => {
    try {
      return mmkv.remove(name);
    } catch (error) {
      // Silently fail
      log.w("Server storage removeItem failed:", [error]);
      return;
    }
  },
};

interface ServerState {
  isRegisteredWithServer: boolean;
  lightningAddress: string | null;
  isBackupEnabled: boolean;
  setRegisteredWithServer: (
    isRegistered: boolean,
    lightningAddress: string | null,
    isBackupEnabled: boolean,
  ) => void;
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
      setRegisteredWithServer: (isRegistered, lightningAddress, isBackupEnabled) =>
        set({ isRegisteredWithServer: isRegistered, lightningAddress, isBackupEnabled }),
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
