import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse } from './socialAuthApi';

export function configureGoogle() {
  GoogleSignin.configure({
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

export async function signInWithGoogle(): Promise<SocialAuthResponse> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();

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
