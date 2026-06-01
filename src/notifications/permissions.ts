import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

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
