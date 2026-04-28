import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../src/store/authStore';

// AsyncStorage is auto-mocked via moduleNameMapper in package.json

const mockGetItem    = AsyncStorage.getItem    as jest.Mock;
const mockSetItem    = AsyncStorage.setItem    as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

const K = {
  ACCESS:  '@pillarm/access_token',
  REFRESH: '@pillarm/refresh_token',
  USER_ID: '@pillarm/user_id',
  EMAIL:   '@pillarm/user_email',
};

function resetStore() {
  useAuthStore.setState({
    accessToken:  null,
    refreshToken: null,
    userId:       null,
    userEmail:    null,
    isLoading:    true,
    isLoggedIn:   false,
  });
}

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  // ── loadSession ────────────────────────────────────────────────────────────

  describe('loadSession', () => {
    it('AsyncStorage 에 저장된 세션을 불러온다', async () => {
      mockGetItem
        .mockResolvedValueOnce('access-tok')
        .mockResolvedValueOnce('refresh-tok')
        .mockResolvedValueOnce('user-1')
        .mockResolvedValueOnce('test@example.com');

      await useAuthStore.getState().loadSession();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('access-tok');
      expect(state.refreshToken).toBe('refresh-tok');
      expect(state.userId).toBe('user-1');
      expect(state.userEmail).toBe('test@example.com');
      expect(state.isLoggedIn).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('저장된 토큰이 없으면 isLoggedIn=false', async () => {
      mockGetItem.mockResolvedValue(null);

      await useAuthStore.getState().loadSession();

      const state = useAuthStore.getState();
      expect(state.isLoggedIn).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('AsyncStorage 에러 발생 시 isLoading=false 로 설정한다', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage error'));

      await useAuthStore.getState().loadSession();

      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  // ── saveSession ────────────────────────────────────────────────────────────

  describe('saveSession', () => {
    it('AsyncStorage 에 토큰을 저장하고 상태를 업데이트한다', async () => {
      mockSetItem.mockResolvedValue(undefined);

      await useAuthStore.getState().saveSession({
        accessToken:  'new-access',
        refreshToken: 'new-refresh',
        userId:       'user-2',
        userEmail:    'user2@example.com',
      });

      expect(mockSetItem).toHaveBeenCalledWith(K.ACCESS,  'new-access');
      expect(mockSetItem).toHaveBeenCalledWith(K.REFRESH, 'new-refresh');
      expect(mockSetItem).toHaveBeenCalledWith(K.USER_ID, 'user-2');
      expect(mockSetItem).toHaveBeenCalledWith(K.EMAIL,   'user2@example.com');

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('new-access');
      expect(state.isLoggedIn).toBe(true);
    });
  });

  // ── clearSession ───────────────────────────────────────────────────────────

  describe('clearSession', () => {
    it('AsyncStorage 에서 토큰을 삭제하고 상태를 초기화한다', async () => {
      // 먼저 세션 채우기
      useAuthStore.setState({ accessToken: 'tok', refreshToken: 'ref', userId: 'u1', userEmail: 'e@e.com', isLoggedIn: true });
      mockRemoveItem.mockResolvedValue(undefined);

      await useAuthStore.getState().clearSession();

      expect(mockRemoveItem).toHaveBeenCalledWith(K.ACCESS);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.REFRESH);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.USER_ID);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.EMAIL);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.isLoggedIn).toBe(false);
    });
  });
});
