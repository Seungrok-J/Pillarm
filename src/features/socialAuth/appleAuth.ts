import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse, type SocialLinkRequired, type DeviceConflict } from './socialAuthApi';

export function isAppleAuthAvailable(): boolean {
  return Platform.OS === 'ios';
}

/** 계정 연결 전용 — 서버 로그인 없이 idToken과 name만 반환 */
export async function getAppleCredentials(): Promise<{ idToken: string; name?: string }> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const idToken = credential.identityToken;
  if (!idToken) throw new Error('Apple identityToken을 받지 못했습니다');
  const name = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ') || undefined
    : undefined;
  return { idToken, name };
}

export async function signInWithApple(): Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict> {
  const { idToken, name } = await getAppleCredentials();
  const fcmToken = await getExpoPushToken();
  return socialLogin({ provider: 'apple', idToken, name, fcmToken: fcmToken ?? undefined });
}
