import { api } from '../careCircle/careCircleApi';

export type SocialProvider = 'apple' | 'google' | 'kakao';

export interface SocialAuthResponse {
  accessToken:  string;
  refreshToken: string;
  userId:       string;
  name?:        string;
  isNewUser:    boolean;
  isAdmin?:     boolean;
}

export interface SocialLinkRequired {
  requiresLink:     true;
  existingProvider: string;  // 기존 계정의 제공자명 (한글)
  newProvider:      string;  // 새로 시도한 제공자명 (한글)
  email:            string;
  linkToken:        string;
}

interface SocialAuthPayload {
  provider:     SocialProvider;
  idToken?:     string;
  accessToken?: string;
  name?:        string;
  fcmToken?:    string;
  forceLogin?:  boolean;
}

export interface DeviceConflict {
  deviceConflict: true;
  message:        string;
}

/** 소셜 로그인 — requiresLink 응답 또는 deviceConflict 응답이 올 수 있음 */
export async function socialLogin(
  payload: SocialAuthPayload,
): Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict> {
  const res = await api.post<SocialAuthResponse | SocialLinkRequired | DeviceConflict>('/auth/social', payload);
  return res.data;
}

/** 계정 연결 확인 (linkToken을 서버에 전달) */
export async function confirmSocialLink(linkToken: string): Promise<SocialAuthResponse> {
  const res = await api.post<SocialAuthResponse>('/auth/social/confirm-link', { linkToken });
  return res.data;
}
