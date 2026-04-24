import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  ACCESS:  '@pillarm/access_token',
  REFRESH: '@pillarm/refresh_token',
  USER_ID: '@pillarm/user_id',
  EMAIL:   '@pillarm/user_email',
} as const;

export interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  userId:       string | null;
  userEmail:    string | null;
  isLoading:    boolean;
  isLoggedIn:   boolean;

  loadSession:  () => Promise<void>;
  saveSession:  (s: { accessToken: string; refreshToken: string; userId: string; userEmail: string }) => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:  null,
  refreshToken: null,
  userId:       null,
  userEmail:    null,
  isLoading:    true,
  isLoggedIn:   false,

  loadSession: async () => {
    try {
      const [access, refresh, userId, email] = await Promise.all([
        AsyncStorage.getItem(K.ACCESS),
        AsyncStorage.getItem(K.REFRESH),
        AsyncStorage.getItem(K.USER_ID),
        AsyncStorage.getItem(K.EMAIL),
      ]);
      set({ accessToken: access, refreshToken: refresh, userId, userEmail: email, isLoggedIn: !!access, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveSession: async ({ accessToken, refreshToken, userId, userEmail }) => {
    await Promise.all([
      AsyncStorage.setItem(K.ACCESS,   accessToken),
      AsyncStorage.setItem(K.REFRESH,  refreshToken),
      AsyncStorage.setItem(K.USER_ID,  userId),
      AsyncStorage.setItem(K.EMAIL,    userEmail),
    ]);
    set({ accessToken, refreshToken, userId, userEmail, isLoggedIn: true });
  },

  clearSession: async () => {
    await Promise.all([
      AsyncStorage.removeItem(K.ACCESS),
      AsyncStorage.removeItem(K.REFRESH),
      AsyncStorage.removeItem(K.USER_ID),
      AsyncStorage.removeItem(K.EMAIL),
    ]);
    set({ accessToken: null, refreshToken: null, userId: null, userEmail: null, isLoggedIn: false });
  },
}));
