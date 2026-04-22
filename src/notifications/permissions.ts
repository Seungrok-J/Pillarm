import * as Notifications from 'expo-notifications';
import { Alert, Linking } from 'react-native';

// 앱이 포그라운드일 때 알림을 배너로 표시합니다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * 알림 권한을 요청합니다.
 * - 이미 허용됐으면 바로 true 를 반환합니다.
 * - 거부됐으면 시스템 설정으로 안내하는 Alert 를 표시하고 false 를 반환합니다.
 */
export async function requestNotificationPermission(): Promise<boolean> {
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
