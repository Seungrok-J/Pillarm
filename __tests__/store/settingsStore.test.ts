/**
 * useSettingsStore 단위 테스트
 * loadSettings / updateSettings
 */

jest.mock('../../src/db', () => ({
  getUserSettings: jest.fn(),
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/notifications', () => ({
  cancelForSchedule: jest.fn().mockResolvedValue(undefined),
}));

import * as db from '../../src/db';
import { useSettingsStore } from '../../src/store';
import type { UserSettings } from '../../src/domain';

const mockGetSettings = db.getUserSettings as jest.Mock;
const mockSaveSettings = db.saveUserSettings as jest.Mock;

const SETTINGS: UserSettings = {
  userId: 'local',
  timeZone: 'Asia/Seoul',
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  defaultSnoozeMinutes: 15,
  maxSnoozeCount: 3,
  missedToLateMinutes: 120,
  autoMarkMissedEnabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: null });
});

describe('loadSettings', () => {
  it('DB 에서 설정을 가져와 상태를 갱신한다', async () => {
    mockGetSettings.mockResolvedValue(SETTINGS);

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings).toEqual(SETTINGS);
  });

  it('DB 가 null 을 반환해도 상태에 null 로 저장된다', async () => {
    mockGetSettings.mockResolvedValue(null);

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings).toBeNull();
  });
});

describe('updateSettings', () => {
  it('saveUserSettings 호출 후 상태를 갱신한다', async () => {
    const updated: UserSettings = { ...SETTINGS, defaultSnoozeMinutes: 30 };

    await useSettingsStore.getState().updateSettings(updated);

    expect(mockSaveSettings).toHaveBeenCalledWith(updated);
    expect(useSettingsStore.getState().settings?.defaultSnoozeMinutes).toBe(30);
  });
});
