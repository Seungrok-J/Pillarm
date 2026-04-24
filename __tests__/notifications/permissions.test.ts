/**
 * requestNotificationPermission 단위 테스트
 * 권한 이미 허용 / 요청 후 허용 / 거부 → Alert 흐름을 검증합니다.
 */

// expo-notifications 를 jest.mock 으로 먼저 선언 (모듈 호이스팅)
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission } from '../../src/notifications/permissions';

const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;

describe('requestNotificationPermission', () => {
  let alertSpy: jest.SpyInstance;
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    linkingSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    linkingSpy.mockRestore();
  });

  it('이미 granted → true 반환, requestPermissionsAsync 호출 안 함', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });

    const result = await requestNotificationPermission();

    expect(result).toBe(true);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('미허용 → 요청 후 granted → true 반환', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });

    const result = await requestNotificationPermission();

    expect(result).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('요청 후 denied → Alert 표시, false 반환', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    const result = await requestNotificationPermission();

    expect(result).toBe(false);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('알림 권한이 필요합니다');
  });

  it('Alert "설정 열기" 버튼 → Linking.openSettings 호출', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await requestNotificationPermission();

    const alertButtons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const settingsBtn = alertButtons.find((b) => b.text === '설정 열기');
    expect(settingsBtn).toBeDefined();
    settingsBtn?.onPress?.();
    expect(linkingSpy).toHaveBeenCalledTimes(1);
  });
});
