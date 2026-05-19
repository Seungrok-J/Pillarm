import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

const CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';

// Naver 콘솔에 등록된 HTTPS redirect URI → oauth-callback.html이 pillarm://oauth-callback 으로 리다이렉트
const REDIRECT_URI = 'https://seungrok-j.github.io/Pillarm/oauth-callback';
// ASWebAuthenticationSession이 pillarm:// 스킴을 감지해 브라우저를 닫고 URL 반환
const CALLBACK_URL = 'pillarm://oauth-callback';

export async function signInWithNaver(): Promise<SocialAuthResponse> {
  const state = Math.random().toString(36).substring(7);
  const authUrl =
    `https://nid.naver.com/oauth2.0/authorize?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}`;

  // openAuthSessionAsync → ASWebAuthenticationSession 사용 (커스텀 스킴 콜백 지원)
  const result = await WebBrowser.openAuthSessionAsync(authUrl, CALLBACK_URL);

  if (result.type !== 'success') throw new Error('SIGN_IN_CANCELLED');

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code as string | undefined;
  const returnedState = queryParams?.state as string | undefined;

  if (!code) throw new Error('네이버 인증 코드를 받지 못했습니다');

  const tokenRes = await fetch(
    `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code` +
    `&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}` +
    `&code=${code}&state=${returnedState}`,
  );
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new Error('네이버 토큰을 받지 못했습니다');

  const fcmToken = await getExpoPushToken();
  return socialLogin({
    provider: 'naver',
    accessToken: tokenData.access_token,
    fcmToken: fcmToken ?? undefined,
  });
}
