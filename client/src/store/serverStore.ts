import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

const storage = new MMKV({
  id: "server-storage",
});

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
