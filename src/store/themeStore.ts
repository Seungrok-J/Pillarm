import { create } from 'zustand';
import { type Theme, THEMES, getTheme, applyTheme, loadSavedThemeId } from '../utils/themeManager';

interface ThemeState {
  activeTheme: Theme;
  /** 구매 완료된 테마 ID 목록 (Phase 2 전체에서는 DB 저장 예정) */
  purchasedIds: string[];
  loadTheme: () => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  markPurchased: (themeId: string) => void;
  isPurchased: (themeId: string) => boolean;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeTheme:  THEMES[0]!,
  purchasedIds: ['default'],

  loadTheme: async () => {
    const id = await loadSavedThemeId();
    set({ activeTheme: getTheme(id) });
  },

  setTheme: async (themeId) => {
    await applyTheme(themeId);
    set({ activeTheme: getTheme(themeId) });
  },

  markPurchased: (themeId) => {
    const ids = get().purchasedIds;
    if (!ids.includes(themeId)) set({ purchasedIds: [...ids, themeId] });
  },

  isPurchased: (themeId) => get().purchasedIds.includes(themeId),
}));
