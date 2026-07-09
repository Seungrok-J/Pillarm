import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStorage';

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

  loadSession:  () => Promise<void>;
  saveSession:  (s: { accessToken: string; refreshToken: string; userId: string; userEmail: string | null; userName?: string | null; isAdmin?: boolean }) => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:  null,
  refreshToken: null,
  userId:       null,
  userEmail:    null,
  userName:     null,
  isLoading:    true,
  isLoggedIn:   false,
  isAdmin:      false,

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
    set({ accessToken: null, refreshToken: null, userId: null, userEmail: null, userName: null, isLoggedIn: false, isAdmin: false });
  },
}));
