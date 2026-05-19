import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { SocialAuthResponse } from './socialAuthApi';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://pillarm-production.up.railway.app';

export async function signInWithNaver(): Promise<SocialAuthResponse> {
  // 서버가 Naver OAuth 전체를 처리하고 pillarm://oauth-callback?... 으로 HTTP 302
  // ASWebAuthenticationSession은 HTTP 302 리다이렉트를 확실하게 감지함
  const result = await WebBrowser.openAuthSessionAsync(
    `${SERVER_URL}/auth/social/naver/start`,
    'pillarm://oauth-callback',
  );

  if (result.type !== 'success') throw new Error('SIGN_IN_CANCELLED');

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error) throw new Error(`네이버 로그인 실패: ${queryParams.error}`);

  return {
    accessToken:  queryParams?.accessToken as string,
    refreshToken: queryParams?.refreshToken as string,
    userId:       queryParams?.userId as string,
    name:         (queryParams?.name as string) || undefined,
    isNewUser:    queryParams?.isNewUser === 'true',
  };
}
