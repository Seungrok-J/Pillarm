import { Platform } from 'react-native';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

// env var가 undefined여도 크래시 방지용 폴백
const IOS_CLIENT_ID = '131302702516-igvegcggjg5mk6pc8nfllaalda99scul.apps.googleusercontent.com';

export function configureGoogle() {
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

export async function signInWithGoogle(): Promise<SocialAuthResponse> {
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  const userInfo = await GoogleSignin.signIn();

  if (userInfo.type !== 'success') throw new Error('Google 로그인을 완료해주세요');

  const idToken = userInfo.data?.idToken;
  if (!idToken) throw new Error('Google idToken을 받지 못했습니다');

  const fcmToken = await getExpoPushToken();

  return socialLogin({
    provider: 'google',
    idToken,
    fcmToken: fcmToken ?? undefined,
  });
}

export { statusCodes as googleStatusCodes };
