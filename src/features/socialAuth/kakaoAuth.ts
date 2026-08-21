import { login } from '@react-native-kakao/user';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse, type SocialLinkRequired, type DeviceConflict } from './socialAuthApi';

// 이메일·닉네임을 서버(kapi.kakao.com/v2/user/me)에서 받으려면 로그인 시점에
// 명시적으로 동의를 요청해야 한다 — 카카오 디벨로퍼스 콘솔의 "카카오 로그인 >
// 동의항목"에서 해당 항목이 활성화돼 있지 않으면 scopes를 요청해도 무시된다.
const KAKAO_LOGIN_SCOPES = ['account_email', 'profile_nickname'];

/** 계정 연결 전용 — 서버 로그인 없이 accessToken만 반환 */
export async function getKakaoAccessToken(): Promise<{ accessToken: string }> {
  const result = await login({ scopes: KAKAO_LOGIN_SCOPES });
  if (!result.accessToken) throw new Error('카카오 accessToken을 받지 못했습니다');
  return { accessToken: result.accessToken };
}

export async function signInWithKakao(): Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict> {
  const { accessToken } = await getKakaoAccessToken();
  const fcmToken = await getExpoPushToken();
  return socialLogin({ provider: 'kakao', accessToken, fcmToken: fcmToken ?? undefined });
}
