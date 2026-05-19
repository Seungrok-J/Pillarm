import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';

const discovery = {
  authorizationEndpoint: 'https://nid.naver.com/oauth2.0/authorize',
  tokenEndpoint: 'https://nid.naver.com/oauth2.0/token',
};

export async function signInWithNaver(): Promise<SocialAuthResponse> {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'pillarm', path: 'oauth' });

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: [],
  });

  const result = await request.promptAsync(discovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('SIGN_IN_CANCELLED');
  }
  if (result.type !== 'success') {
    throw new Error('네이버 로그인에 실패했습니다');
  }

  const { code, state } = result.params;

  const tokenRes = await fetch(
    `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&state=${state}`,
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
