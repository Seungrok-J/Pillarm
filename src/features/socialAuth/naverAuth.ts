import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

const CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';

export async function signInWithNaver(): Promise<SocialAuthResponse> {
  const state = Math.random().toString(36).substring(7);
  const redirectUri = 'https://seungrok-j.github.io/Pillarm/oauth-callback';
  const authUrl =
    `https://nid.naver.com/oauth2.0/authorize?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return new Promise<SocialAuthResponse>((resolve, reject) => {
    let settled = false;

    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!url.startsWith('pillarm://oauth')) return;
      if (settled) return;
      settled = true;
      subscription.remove();

      try { WebBrowser.dismissBrowser(); } catch {}

      try {
        const { queryParams } = Linking.parse(url);
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
        const result = await socialLogin({
          provider: 'naver',
          accessToken: tokenData.access_token,
          fcmToken: fcmToken ?? undefined,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });

    WebBrowser.openBrowserAsync(authUrl)
      .then(result => {
        if (!settled && (result.type === 'cancel' || result.type === 'dismiss')) {
          settled = true;
          subscription.remove();
          reject(new Error('SIGN_IN_CANCELLED'));
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true;
          subscription.remove();
          reject(err);
        }
      });
  });
}
