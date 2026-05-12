import { login } from '@react-native-kakao/user';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

export async function signInWithKakao(): Promise<SocialAuthResponse> {
  const result = await login();

  if (!result.accessToken) throw new Error('카카오 accessToken을 받지 못했습니다');

  const fcmToken = await getExpoPushToken();

  return socialLogin({
    provider:    'kakao',
    accessToken: result.accessToken,
    fcmToken:    fcmToken ?? undefined,
  });
}
