import { login } from '@react-native-kakao/user';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse, type SocialLinkRequired, type DeviceConflict } from './socialAuthApi';

// 이메일·닉네임 동의 항목은 카카오 디벨로퍼스 콘솔의 "카카오 로그인 > 동의항목"
// 설정을 그대로 따른다. login()에 scopes를 직접 넘기면 카카오톡 앱 로그인
// (useKakaoAccountLogin: false, 기본값)에서 "prompts/scopes는 useKakaoAccountLogin이
// true일 때만 가능" 에러로 로그인 자체가 실패하므로 넘기지 않는다.

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
