import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { mmkv } from "~/lib/mmkv";
import logger from "~/lib/log";

const log = logger("backupStore");

type BackupStatus = "idle" | "in_progress" | "success" | "failed";

interface BackupState {
  lastBackupAt: number | null;
  lastBackupAttemptAt: number | null;
  lastBackupStatus: BackupStatus;
  lastBackupError: string | null;
  setBackupInProgress: () => void;
  setBackupSuccess: () => void;
  setBackupFailed: (error: string) => void;
  reset: () => void;
}

const zustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    try {
      return mmkv.set(name, value);
    } catch (error) {
      // Silently fail to prevent error loops and crashes
      log.e("Backup storage setItem failed:", [error]);
      return;
    }
  },
  getItem: (name: string) => {
    try {
      const value = mmkv.getString(name);
      return value ?? null;
    } catch (error) {
      // Silently fail and return null
      log.e("Backup storage getItem failed:", [error]);
      return null;
    }
  },
  removeItem: (name: string) => {
    try {
      return mmkv.remove(name);
    } catch (error) {
      // Silently fail
      log.e("Backup storage removeItem failed:", [error]);
      return;
    }
  },
};

const initialState = {
  lastBackupAt: null,
  lastBackupAttemptAt: null,
  lastBackupStatus: "idle" as BackupStatus,
  lastBackupError: null,
};

export const useBackupStore = create<BackupState>()(
  persist(
    (set) => ({
      ...initialState,
      setBackupInProgress: () =>
        set({
          lastBackupStatus: "in_progress",
          lastBackupAttemptAt: Date.now(),
          lastBackupError: null,
        }),
      setBackupSuccess: () =>
        set({
          lastBackupStatus: "success",
          lastBackupAt: Date.now(),
          lastBackupError: null,
        }),
      setBackupFailed: (error: string) =>
        set({
          lastBackupStatus: "failed",
          lastBackupError: error,
        }),
      reset: () => set(initialState),
    }),
    {
      name: "backup-storage",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
