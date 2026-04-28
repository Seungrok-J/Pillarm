import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../src/store/themeStore';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

function resetStore() {
  useThemeStore.setState({
    activeTheme:  { id: 'default', name: '기본', price: 0, primary: '#3b82f6', primaryLight: '#eff6ff', background: '#f9fafb', surface: '#ffffff', text: '#111827', textSecondary: '#6b7280' },
    purchasedIds: ['default'],
  });
}

describe('themeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  // ── loadTheme ──────────────────────────────────────────────────────────────

  describe('loadTheme', () => {
    it('저장된 테마 ID 로 activeTheme 을 설정한다', async () => {
      mockGetItem.mockResolvedValue('mint');
      await useThemeStore.getState().loadTheme();
      expect(useThemeStore.getState().activeTheme.id).toBe('mint');
    });

    it('저장된 값이 없으면 default 테마를 사용한다', async () => {
      mockGetItem.mockResolvedValue(null);
      await useThemeStore.getState().loadTheme();
      expect(useThemeStore.getState().activeTheme.id).toBe('default');
    });
  });

  // ── setTheme ───────────────────────────────────────────────────────────────

  describe('setTheme', () => {
    it('테마를 AsyncStorage 에 저장하고 activeTheme 을 업데이트한다', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await useThemeStore.getState().setTheme('coral');
      expect(mockSetItem).toHaveBeenCalledWith('@pillarm/active_theme', 'coral');
      expect(useThemeStore.getState().activeTheme.id).toBe('coral');
    });
  });

  // ── markPurchased ──────────────────────────────────────────────────────────

  describe('markPurchased', () => {
    it('새 테마 ID 를 purchasedIds 에 추가한다', () => {
      useThemeStore.getState().markPurchased('mint');
      expect(useThemeStore.getState().purchasedIds).toContain('mint');
    });

    it('이미 포함된 ID 는 중복 추가하지 않는다', () => {
      useThemeStore.getState().markPurchased('default');
      expect(useThemeStore.getState().purchasedIds.filter((id) => id === 'default')).toHaveLength(1);
    });
  });

  // ── isPurchased ────────────────────────────────────────────────────────────

  describe('isPurchased', () => {
    it('구매한 테마 ID 에 대해 true 반환', () => {
      expect(useThemeStore.getState().isPurchased('default')).toBe(true);
    });

    it('구매하지 않은 테마 ID 에 대해 false 반환', () => {
      expect(useThemeStore.getState().isPurchased('lavender')).toBe(false);
    });
  });
});
