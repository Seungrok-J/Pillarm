import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

export function isAppleAuthAvailable(): boolean {
  return Platform.OS === 'ios';
}

export async function signInWithApple(): Promise<SocialAuthResponse> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const fcmToken = await getExpoPushToken();

  // Apple은 최초 로그인 시에만 fullName을 제공한다
  const name = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ') || undefined
    : undefined;

  return socialLogin({
    provider:    'apple',
    idToken:     credential.identityToken ?? undefined,
    name,
    fcmToken:    fcmToken ?? undefined,
  });
}
