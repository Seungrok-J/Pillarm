import { api } from '../careCircle/careCircleApi';

export type SocialProvider = 'apple' | 'google' | 'kakao';

export interface SocialAuthResponse {
  accessToken:  string;
  refreshToken: string;
  userId:       string;
  name?:        string;
  isNewUser:    boolean;
}

export interface SocialLinkRequired {
  requiresLink:     true;
  existingProvider: string;  // 기존 계정의 제공자명 (한글)
  newProvider:      string;  // 새로 시도한 제공자명 (한글)
  email:            string;
  linkToken:        string;
}

export interface SocialConnection {
  provider: string;
  linkedAt: string;
}

interface SocialAuthPayload {
  provider:     SocialProvider;
  idToken?:     string;
  accessToken?: string;
  name?:        string;
  fcmToken?:    string;
}

/** 소셜 로그인 — requiresLink 응답이 올 수 있음 */
export async function socialLogin(
  payload: SocialAuthPayload,
): Promise<SocialAuthResponse | SocialLinkRequired> {
  const res = await api.post<SocialAuthResponse | SocialLinkRequired>('/auth/social', payload);
  return res.data;
}

/** 계정 연결 확인 (linkToken을 서버에 전달) */
export async function confirmSocialLink(linkToken: string): Promise<SocialAuthResponse> {
  const res = await api.post<SocialAuthResponse>('/auth/social/confirm-link', { linkToken });
  return res.data;
}

/** 연결된 소셜 계정 목록 조회 */
export async function getSocialConnections(): Promise<{ connections: SocialConnection[]; hasPassword: boolean }> {
  const res = await api.get<{ connections: SocialConnection[]; hasPassword: boolean }>(
    '/auth/social/connections',
  );
  return res.data;
}

/** 현재 로그인한 계정에 소셜 계정 추가 연결 */
export async function linkSocialAccount(payload: SocialAuthPayload): Promise<void> {
  await api.post('/auth/social/link', payload);
}

/** 소셜 연결 해제 */
export async function unlinkSocialAccount(provider: string): Promise<void> {
  await api.delete(`/auth/social/link/${provider}`);
}
