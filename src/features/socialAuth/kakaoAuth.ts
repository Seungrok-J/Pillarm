import { login } from '@react-native-kakao/user';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse, type SocialLinkRequired, type DeviceConflict } from './socialAuthApi';

/** 계정 연결 전용 — 서버 로그인 없이 accessToken만 반환 */
export async function getKakaoAccessToken(): Promise<{ accessToken: string }> {
  const result = await login();
  if (!result.accessToken) throw new Error('카카오 accessToken을 받지 못했습니다');
  return { accessToken: result.accessToken };
}

export async function signInWithKakao(): Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict> {
  const { accessToken } = await getKakaoAccessToken();
  const fcmToken = await getExpoPushToken();
  return socialLogin({ provider: 'kakao', accessToken, fcmToken: fcmToken ?? undefined });
}
