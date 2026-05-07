import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../features/careCircle/careCircleApi';

/** 알림 권한이 허용된 경우 Expo 푸시 토큰을 반환한다. */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const { data } = await Notifications.getExpoPushTokenAsync();
    return data;
  } catch {
    return null;
  }
}

/** 서버에 FCM(Expo 푸시) 토큰을 등록한다. 실패해도 조용히 무시한다. */
export async function registerTokenOnServer(token: string): Promise<void> {
  try {
    await api.patch('/auth/fcm-token', { fcmToken: token });
  } catch {
    // 로그인 만료·네트워크 오류 시 다음 로그인 때 재시도
  }
}

/** 권한 확인 후 토큰을 얻어 서버에 등록한다. */
export async function syncPushToken(): Promise<void> {
  const token = await getExpoPushToken();
  if (token) await registerTokenOnServer(token);
}
