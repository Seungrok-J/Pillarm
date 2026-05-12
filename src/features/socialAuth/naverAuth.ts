import NaverLogin from 'react-native-naver-login';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

export async function signInWithNaver(): Promise<SocialAuthResponse> {
  const result = await NaverLogin.login();

  if (result.isSuccess === false || !result.successResponse?.accessToken) {
    throw new Error('네이버 로그인에 실패했습니다');
  }

  const fcmToken = await getExpoPushToken();

  return socialLogin({
    provider:    'naver',
    accessToken: result.successResponse.accessToken,
    fcmToken:    fcmToken ?? undefined,
  });
}
