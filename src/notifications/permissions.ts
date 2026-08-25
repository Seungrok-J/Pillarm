import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

if (Platform.OS === 'android') {
  // 기본 채널에 브랜드 색상·진동 패턴을 지정 — 지정하지 않으면 무채색 기본 스타일로 표시된다
  Notifications.setNotificationChannelAsync('default', {
    name: '복용 알림',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#3b82f6',
    vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {});
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, unknown>;
      const notifUserId = data['userId'] as string | undefined;
      const currentUserId = useAuthStore.getState().userId ?? 'local';

      // 알림에 userId가 있고 현재 로그인한 사용자와 다르면 표시하지 않음
      if (notifUserId && notifUserId !== currentUserId) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status === 'granted') return true;

  Alert.alert(
    '알림 권한이 필요합니다',
    '약 복용 알림을 받으려면 알림 권한이 필요합니다.\n설정에서 알림을 허용해 주세요.',
    [
      { text: '취소', style: 'cancel' },
      {
        text: '설정 열기',
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ],
  );
  return false;
}
