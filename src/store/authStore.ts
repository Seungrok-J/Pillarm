import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  ACCESS:  '@pillarm/access_token',
  REFRESH: '@pillarm/refresh_token',
  USER_ID: '@pillarm/user_id',
  EMAIL:   '@pillarm/user_email',
  NAME:    '@pillarm/user_name',
} as const;

export interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  userId:       string | null;
  userEmail:    string | null;
  userName:     string | null;
  isLoading:    boolean;
  isLoggedIn:   boolean;

  loadSession:  () => Promise<void>;
  saveSession:  (s: { accessToken: string; refreshToken: string; userId: string; userEmail: string; userName?: string | null }) => Promise<void>;
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

  loadSession: async () => {
    try {
      const [access, refresh, userId, email, name] = await Promise.all([
        AsyncStorage.getItem(K.ACCESS),
        AsyncStorage.getItem(K.REFRESH),
        AsyncStorage.getItem(K.USER_ID),
        AsyncStorage.getItem(K.EMAIL),
        AsyncStorage.getItem(K.NAME),
      ]);
      set({ accessToken: access, refreshToken: refresh, userId, userEmail: email, userName: name, isLoggedIn: !!access, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveSession: async ({ accessToken, refreshToken, userId, userEmail, userName }) => {
    await Promise.all([
      AsyncStorage.setItem(K.ACCESS,   accessToken),
      AsyncStorage.setItem(K.REFRESH,  refreshToken),
      AsyncStorage.setItem(K.USER_ID,  userId),
      AsyncStorage.setItem(K.EMAIL,    userEmail),
      userName != null
        ? AsyncStorage.setItem(K.NAME, userName)
        : AsyncStorage.removeItem(K.NAME),
    ]);
    set({ accessToken, refreshToken, userId, userEmail, userName: userName ?? null, isLoggedIn: true });
  },

  clearSession: async () => {
    await Promise.all([
      AsyncStorage.removeItem(K.ACCESS),
      AsyncStorage.removeItem(K.REFRESH),
      AsyncStorage.removeItem(K.USER_ID),
      AsyncStorage.removeItem(K.EMAIL),
      AsyncStorage.removeItem(K.NAME),
    ]);
    set({ accessToken: null, refreshToken: null, userId: null, userEmail: null, userName: null, isLoggedIn: false });
  },
}));
