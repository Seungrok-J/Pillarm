import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStorage';
import { setSentryUser } from '../monitoring';

// 토큰은 tokenStorage(SecureStore)에 저장하고, 민감하지 않은 프로필 정보만 AsyncStorage 에 둔다.
const K = {
  USER_ID:  '@pillarm/user_id',
  EMAIL:    '@pillarm/user_email',
  NAME:     '@pillarm/user_name',
  IS_ADMIN: '@pillarm/is_admin',
} as const;

export interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  userId:       string | null;
  userEmail:    string | null;
  userName:     string | null;
  isLoading:    boolean;
  isLoggedIn:   boolean;
  isAdmin:      boolean;

  /**
   * 개발 빌드에서 로그인 없이 화면을 열어보려고 켠 상태인지.
   *
   * 진짜 세션이 아니라 토큰이 없다. 서버를 부르는 코드는 이 값을 보고 요청을
   * 건너뛰어야 한다 — 그러지 않으면 401 만 잔뜩 만든다.
   */
  isDevBypass:  boolean;

  loadSession:  () => Promise<void>;
  saveSession:  (s: { accessToken: string; refreshToken: string; userId: string; userEmail: string | null; userName?: string | null; isAdmin?: boolean }) => Promise<void>;
  clearSession: () => Promise<void>;
  /**
   * 로그인 화면을 지나치지 않고 로그인 뒤 화면을 열어보기 위한 개발 전용 우회.
   * `__DEV__` 가 아니면 아무 일도 하지 않는다.
   */
  enableDevBypass: () => void;
}

/** 개발 우회로 들어왔을 때 쓰는 userId. 서버에 존재하지 않는 값이다 */
export const DEV_BYPASS_USER_ID = 'dev-bypass';

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:  null,
  refreshToken: null,
  userId:       null,
  userEmail:    null,
  userName:     null,
  isLoading:    true,
  isLoggedIn:   false,
  isAdmin:      false,
  isDevBypass:  false,

  loadSession: async () => {
    try {
      const [access, refresh, userId, email, name, adminStr] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
        AsyncStorage.getItem(K.USER_ID),
        AsyncStorage.getItem(K.EMAIL),
        AsyncStorage.getItem(K.NAME),
        AsyncStorage.getItem(K.IS_ADMIN),
      ]);
      set({
        accessToken: access, refreshToken: refresh, userId,
        userEmail: email, userName: name,
        isLoggedIn: !!access, isLoading: false,
        isAdmin: adminStr === '1',
      });
      setSentryUser(access ? userId : null);
    } catch {
      set({ isLoading: false });
    }
  },

  saveSession: async ({ accessToken, refreshToken, userId, userEmail, userName, isAdmin }) => {
    // 다른 계정으로 전환 시 기존 알림 전부 취소
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    await Promise.all([
      setTokens(accessToken, refreshToken),
      AsyncStorage.setItem(K.USER_ID,  userId),
      userEmail != null
        ? AsyncStorage.setItem(K.EMAIL, userEmail)
        : AsyncStorage.removeItem(K.EMAIL),
      userName != null
        ? AsyncStorage.setItem(K.NAME, userName)
        : AsyncStorage.removeItem(K.NAME),
      isAdmin
        ? AsyncStorage.setItem(K.IS_ADMIN, '1')
        : AsyncStorage.removeItem(K.IS_ADMIN),
    ]);
    set({ accessToken, refreshToken, userId, userEmail, userName: userName ?? null, isLoggedIn: true, isAdmin: !!isAdmin });
    // 크래시 리포트 귀속용 — 익명 userId 만 넘긴다(이메일·이름 제외)
    setSentryUser(userId);
  },

  clearSession: async () => {
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    await Promise.all([
      clearTokens(),
      AsyncStorage.removeItem(K.USER_ID),
      AsyncStorage.removeItem(K.EMAIL),
      AsyncStorage.removeItem(K.NAME),
      AsyncStorage.removeItem(K.IS_ADMIN),
    ]);
    set({ accessToken: null, refreshToken: null, userId: null, userEmail: null, userName: null, isLoggedIn: false, isAdmin: false, isDevBypass: false });
    setSentryUser(null);
  },

  enableDevBypass: () => {
    if (!__DEV__) return;
    // 저장하지 않는다 — 앱을 다시 켜면 사라지고, 릴리스 빌드에는 남을 여지가 없다.
    set({
      accessToken: null,
      refreshToken: null,
      userId:      DEV_BYPASS_USER_ID,
      userEmail:   'dev@pillarm.local',
      userName:    '개발용 계정',
      isLoggedIn:  true,
      isAdmin:     true,
      isLoading:   false,
      isDevBypass: true,
    });
  },
}));
