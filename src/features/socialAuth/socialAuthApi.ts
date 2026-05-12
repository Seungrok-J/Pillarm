import { api } from '../careCircle/careCircleApi';

export type SocialProvider = 'apple' | 'google' | 'kakao' | 'naver';

export interface SocialAuthResponse {
  accessToken:  string;
  refreshToken: string;
  userId:       string;
  name?:        string;
  isNewUser:    boolean;
}

interface SocialAuthPayload {
  provider:     SocialProvider;
  idToken?:     string;
  accessToken?: string;
  name?:        string;
  fcmToken?:    string;
}

export async function socialLogin(payload: SocialAuthPayload): Promise<SocialAuthResponse> {
  const res = await api.post<SocialAuthResponse>('/auth/social', payload);
  return res.data;
}
