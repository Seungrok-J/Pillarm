import { Platform } from 'react-native';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getExpoPushToken } from '../../notifications/pushToken';
import { socialLogin, type SocialAuthResponse, type SocialLinkRequired, type DeviceConflict } from './socialAuthApi';

// env var가 undefined여도 크래시 방지용 폴백
const IOS_CLIENT_ID = '131302702516-igvegcggjg5mk6pc8nfllaalda99scul.apps.googleusercontent.com';

export function configureGoogle() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  // webClientId 없이도 iosClientId만으로 동작 가능
  // webClientId 있으면 idToken audience = 웹 클라이언트 ID (서버 검증 일치 필요)
  GoogleSignin.configure({
    iosClientId,
    ...(webClientId ? { webClientId } : {}),
  });

  console.log('[Google] configured — iosClientId prefix:', iosClientId.slice(0, 30));
  console.log('[Google] webClientId:', webClientId ? 'SET' : 'NOT SET (iosClientId audience mode)');
}

export async function signInWithGoogle(): Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict> {
  // 이미 로그인된 세션이 있으면 먼저 로그아웃 (세션 충돌 방지)
  try {
    const isSignedIn = await GoogleSignin.getCurrentUser();
    if (isSignedIn) await GoogleSignin.signOut();
  } catch {}

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const userInfo = await GoogleSignin.signIn();

  if (userInfo.type === 'cancelled') {
    throw Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' });
  }
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
