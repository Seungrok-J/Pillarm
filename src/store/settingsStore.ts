import { create } from 'zustand';
import { UserSettings } from '../domain';
import { getUserSettings, saveUserSettings } from '../db';

interface SettingsState {
  settings: UserSettings | null;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,

  loadSettings: async () => {
    const settings = await getUserSettings();
    set({ settings });
  },

  updateSettings: async (settings) => {
    await saveUserSettings(settings);
    set({ settings });
  },
}));
