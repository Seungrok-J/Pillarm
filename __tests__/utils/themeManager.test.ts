import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, applyTheme, loadSavedThemeId, THEMES } from '../../src/utils/themeManager';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

const THEME_KEY = '@pillarm/active_theme';

describe('themeManager', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getTheme ───────────────────────────────────────────────────────────────

  describe('getTheme', () => {
    it('유효한 ID 로 테마를 반환한다', () => {
      const theme = getTheme('mint');
      expect(theme.id).toBe('mint');
      expect(theme.primary).toBe('#10b981');
    });

    it('알 수 없는 ID 면 기본 테마를 반환한다', () => {
      const theme = getTheme('nonexistent');
      expect(theme.id).toBe('default');
    });

    it('모든 THEMES 의 ID 를 조회할 수 있다', () => {
      THEMES.forEach((t) => {
        expect(getTheme(t.id).id).toBe(t.id);
      });
    });
  });

  // ── applyTheme ─────────────────────────────────────────────────────────────

  describe('applyTheme', () => {
    it('AsyncStorage 에 테마 ID 를 저장한다', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await applyTheme('coral');
      expect(mockSetItem).toHaveBeenCalledWith(THEME_KEY, 'coral');
    });
  });

  // ── loadSavedThemeId ───────────────────────────────────────────────────────

  describe('loadSavedThemeId', () => {
    it('저장된 테마 ID 를 반환한다', async () => {
      mockGetItem.mockResolvedValue('lavender');
      const id = await loadSavedThemeId();
      expect(id).toBe('lavender');
    });

    it('저장된 값이 없으면 "default" 반환', async () => {
      mockGetItem.mockResolvedValue(null);
      const id = await loadSavedThemeId();
      expect(id).toBe('default');
    });

    it('AsyncStorage 에러 시 "default" 반환', async () => {
      mockGetItem.mockRejectedValue(new Error('Read error'));
      const id = await loadSavedThemeId();
      expect(id).toBe('default');
    });
  });
});
