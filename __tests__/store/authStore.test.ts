import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../src/store/authStore';

// AsyncStorage · expo-secure-store 는 package.json moduleNameMapper 로 auto-mock 됨

const mockGetItem    = AsyncStorage.getItem    as jest.Mock;
const mockSetItem    = AsyncStorage.setItem    as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

const mockSecureGet = SecureStore.getItemAsync    as jest.Mock;
const mockSecureSet = SecureStore.setItemAsync    as jest.Mock;
const mockSecureDel = SecureStore.deleteItemAsync as jest.Mock;

// 토큰은 SecureStore(영숫자·"."·"_" 키), 프로필은 AsyncStorage
const K = {
  ACCESS:        'pillarm.access_token',
  REFRESH:       'pillarm.refresh_token',
  LEGACY_ACCESS: '@pillarm/access_token',
  LEGACY_REFRESH: '@pillarm/refresh_token',
  USER_ID:       '@pillarm/user_id',
  EMAIL:         '@pillarm/user_email',
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
    mockSecureGet.mockResolvedValue(null);
    mockSecureSet.mockResolvedValue(undefined);
    mockSecureDel.mockResolvedValue(undefined);
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    resetStore();
  });

  // ── loadSession ────────────────────────────────────────────────────────────

  describe('loadSession', () => {
    it('SecureStore 토큰과 AsyncStorage 프로필로 세션을 불러온다', async () => {
      mockSecureGet.mockImplementation(async (key: string) => {
        if (key === K.ACCESS)  return 'access-tok';
        if (key === K.REFRESH) return 'refresh-tok';
        return null;
      });
      mockGetItem.mockImplementation(async (key: string) => {
        if (key === K.USER_ID) return 'user-1';
        if (key === K.EMAIL)   return 'test@example.com';
        return null;
      });

      await useAuthStore.getState().loadSession();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('access-tok');
      expect(state.refreshToken).toBe('refresh-tok');
      expect(state.userId).toBe('user-1');
      expect(state.userEmail).toBe('test@example.com');
      expect(state.isLoggedIn).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('SecureStore 에 없으면 레거시 AsyncStorage 토큰을 이관해서 사용한다', async () => {
      // 구버전(평문 AsyncStorage 저장) 사용자가 업데이트 후에도 로그아웃되지 않아야 한다
      mockGetItem.mockImplementation(async (key: string) => {
        if (key === K.LEGACY_ACCESS)  return 'legacy-access';
        if (key === K.LEGACY_REFRESH) return 'legacy-refresh';
        if (key === K.USER_ID)        return 'user-1';
        return null;
      });

      await useAuthStore.getState().loadSession();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('legacy-access');
      expect(state.refreshToken).toBe('legacy-refresh');
      expect(state.isLoggedIn).toBe(true);
      // SecureStore 로 이관되고 평문 키는 삭제된다
      expect(mockSecureSet).toHaveBeenCalledWith(K.ACCESS,  'legacy-access');
      expect(mockSecureSet).toHaveBeenCalledWith(K.REFRESH, 'legacy-refresh');
      expect(mockRemoveItem).toHaveBeenCalledWith(K.LEGACY_ACCESS);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.LEGACY_REFRESH);
    });

    it('저장된 토큰이 없으면 isLoggedIn=false', async () => {
      await useAuthStore.getState().loadSession();

      const state = useAuthStore.getState();
      expect(state.isLoggedIn).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('저장소 에러 발생 시 isLoading=false 로 설정한다', async () => {
      mockSecureGet.mockRejectedValue(new Error('Keychain error'));

      await useAuthStore.getState().loadSession();

      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  // ── saveSession ────────────────────────────────────────────────────────────

  describe('saveSession', () => {
    it('토큰은 SecureStore, 프로필은 AsyncStorage 에 저장하고 상태를 업데이트한다', async () => {
      await useAuthStore.getState().saveSession({
        accessToken:  'new-access',
        refreshToken: 'new-refresh',
        userId:       'user-2',
        userEmail:    'user2@example.com',
      });

      expect(mockSecureSet).toHaveBeenCalledWith(K.ACCESS,  'new-access');
      expect(mockSecureSet).toHaveBeenCalledWith(K.REFRESH, 'new-refresh');
      expect(mockSetItem).toHaveBeenCalledWith(K.USER_ID, 'user-2');
      expect(mockSetItem).toHaveBeenCalledWith(K.EMAIL,   'user2@example.com');
      // 토큰이 평문 AsyncStorage 로 새어 나가지 않아야 한다
      expect(mockSetItem).not.toHaveBeenCalledWith(expect.anything(), 'new-access');
      expect(mockSetItem).not.toHaveBeenCalledWith(expect.anything(), 'new-refresh');

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('new-access');
      expect(state.isLoggedIn).toBe(true);
    });
  });

  // ── clearSession ───────────────────────────────────────────────────────────

  describe('clearSession', () => {
    it('SecureStore·AsyncStorage 에서 세션을 삭제하고 상태를 초기화한다', async () => {
      useAuthStore.setState({ accessToken: 'tok', refreshToken: 'ref', userId: 'u1', userEmail: 'e@e.com', isLoggedIn: true });

      await useAuthStore.getState().clearSession();

      expect(mockSecureDel).toHaveBeenCalledWith(K.ACCESS);
      expect(mockSecureDel).toHaveBeenCalledWith(K.REFRESH);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.LEGACY_ACCESS);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.LEGACY_REFRESH);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.USER_ID);
      expect(mockRemoveItem).toHaveBeenCalledWith(K.EMAIL);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.isLoggedIn).toBe(false);
    });
  });
});
