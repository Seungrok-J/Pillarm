import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';

// ── 설정 ──────────────────────────────────────────────────────────────────────
// 실기기(Expo Go QR): 컴퓨터 로컬 IP (예: 192.168.0.x)
// Android 에뮬레이터: 10.0.2.2
// iOS 시뮬레이터: localhost
const API_BASE_URL_MAP = {
  emulator: 'http://10.0.2.2:3000',
  device:   `http://${process.env.EXPO_PUBLIC_SERVER_IP ?? 'localhost'}:3000`,
};
export const API_BASE_URL = process.env.EXPO_PUBLIC_SERVER_IP
  ? API_BASE_URL_MAP.device
  : API_BASE_URL_MAP.emulator;

const ACCESS_KEY  = '@pillarm/access_token';
const REFRESH_KEY = '@pillarm/refresh_token';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: Bearer 토큰 자동 주입 ────────────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: 401 → 토큰 갱신 후 재시도 ─────────────────────────

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function flushQueue(err: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => err ? reject(err) : resolve(token!));
  pendingQueue = [];
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);
    original._retry = true;

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refreshToken) throw new Error('no_refresh');

      const res = await axios.post<{ accessToken: string; refreshToken: string }>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
      );
      const { accessToken, refreshToken: newRefresh } = res.data;

      await AsyncStorage.setItem(ACCESS_KEY,  accessToken);
      await AsyncStorage.setItem(REFRESH_KEY, newRefresh);

      flushQueue(null, accessToken);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (err) {
      flushQueue(err, null);
      // 갱신 실패 → 로그아웃 처리
      await useAuthStore.getState().clearSession();
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken:  string;
  refreshToken: string;
  userId:       string;
  name?:        string;
}

export async function authSignup(email: string, password: string, name?: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/signup', { email, password, name });
  return res.data;
}

export async function authLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', { email, password });
  return res.data;
}

// ── Auth Profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id:        string;
  email:     string;
  name?:     string;
  provider?: string;
  createdAt: string;
}

export const getMyProfile   = () => api.get<UserProfile>('/auth/me').then((r) => r.data);
export const updateMyName   = (name: string) => api.patch<UserProfile>('/auth/me', { name }).then((r) => r.data);
export const resetPassword  = (email: string, name: string, newPassword: string) =>
  api.post<{ message: string }>('/auth/reset-password', { email, name, newPassword }).then((r) => r.data);

// ── CareCircle 타입 ───────────────────────────────────────────────────────────

export interface ApiCareMember {
  id:              string;
  careCircleId:    string;
  memberUserId:    string;
  memberUserName?: string;
  memberUserEmail?: string;
  role:            'admin' | 'viewer' | 'notifyOnly';
  nickname?:       string;
  createdAt:       string;
}

export interface ApiSharePolicy {
  id:                 string;
  careCircleId:       string;
  shareScope:         'all' | 'specificMedication' | 'specificSchedule';
  allowedFields:      string[];
  notificationPolicy: 'realtime' | 'dailySummary';
}

export interface ApiCareCircle {
  id:             string;
  ownerUserId:    string;
  ownerUserName?: string;
  ownerUserEmail?: string;
  name:           string;
  members:        ApiCareMember[];
  policies:       ApiSharePolicy[];
}

export interface DoseSnapshot {
  id:          string;
  careCircleId: string;
  patientId:   string;
  date:        string;
  data:        unknown;
  updatedAt:   string;
}

// ── CareCircle API ────────────────────────────────────────────────────────────

export const createCircle  = (name: string)  => api.post<ApiCareCircle>('/care-circles', { name }).then((r) => r.data);
export const listCircles   = ()              => api.get<ApiCareCircle[]>('/care-circles').then((r) => r.data);
export const getCircle     = (id: string)    => api.get<ApiCareCircle>(`/care-circles/${id}`).then((r) => r.data);
export const deleteCircle  = (id: string)    => api.delete(`/care-circles/${id}`);
export const createInvite  = (id: string)    =>
  api.post<{ code: string; expiresAt: string }>(`/care-circles/${id}/invite`).then((r) => r.data);
export const joinCircle    = (code: string)  =>
  api.post<ApiCareMember>('/care-circles/join', { code }).then((r) => r.data);
export const deleteMember  = (circleId: string, memberId: string) =>
  api.delete(`/care-circles/${circleId}/members/${memberId}`);
export const updateMemberNickname = (circleId: string, memberId: string, nickname: string) =>
  api.patch<ApiCareMember>(`/care-circles/${circleId}/members/${memberId}`, { nickname }).then((r) => r.data);

// ── DoseSync API ──────────────────────────────────────────────────────────────

export const uploadSnapshot = (circleId: string, patientId: string, events: unknown) =>
  api.put<DoseSnapshot>(`/care-circles/${circleId}/members/${patientId}/today`, events).then((r) => r.data);

export const getSnapshot = (circleId: string, patientId: string) =>
  api.get<DoseSnapshot>(`/care-circles/${circleId}/members/${patientId}/today`).then((r) => r.data);
