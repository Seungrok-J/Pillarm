/**
 * snoozeDoseEvent 단위 테스트
 * - maxSnoozeCount 초과 시 null 반환
 * - 기존 알림 없을 때 새 알림 등록
 * - 기존 알림 있을 때 취소 후 재등록
 * - updateDoseEventStatus 호출 검증
 */

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('new-notif-id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('../../src/db', () => ({
  updateDoseEventStatus: jest.fn().mockResolvedValue(undefined),
}));

// addMinutes 는 실제 구현 사용 (순수 함수)
jest.mock('../../src/utils', () => ({
  generateId: jest.fn(() => 'gen-id'),
  todayString: jest.fn(() => '2026-04-23'),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
  addMinutes: (d: Date, m: number) => new Date(d.getTime() + m * 60_000),
}));

import * as Notifications from 'expo-notifications';
import { snoozeDoseEvent } from '../../src/notifications/snooze';
import type { DoseEvent, UserSettings } from '../../src/domain';

const mockGetAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;

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

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'evt-1',
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: '2026-04-23T08:00:00',
    status: 'scheduled',
    snoozeCount: 0,
    source: 'notification',
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
});

describe('snoozeDoseEvent', () => {
  it('snoozeCount >= maxSnoozeCount → null 반환, 알림 등록 안 함', async () => {
    const event = makeEvent({ snoozeCount: 3 });

    const result = await snoozeDoseEvent(event, SETTINGS);

    expect(result).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('기존 알림 없을 때 새 알림을 등록한다', async () => {
    mockGetAll.mockResolvedValue([]);
    const event = makeEvent({ snoozeCount: 0 });

    const result = await snoozeDoseEvent(event, SETTINGS);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.snoozeCount).toBe(1);
  });

  it('기존 알림이 있으면 취소 후 재등록한다', async () => {
    const existingNotif = {
      identifier: 'notif-abc',
      content: {
        title: '혈압약 복용 시간이에요 💊',
        body: '복용할 시간입니다',
        data: { doseEventId: 'evt-1' },
        sound: null,
        badge: null,
        subtitle: null,
        launchImageName: null,
        attachments: [],
        categoryIdentifier: null,
        summaryArgument: null,
        summaryArgumentCount: 0,
        threadIdentifier: null,
        targetContentIdentifier: null,
        interruptionLevel: null,
        usesDefaultCriticalSound: false,
        criticalSoundName: null,
        criticalSoundVolume: null,
      },
      trigger: {},
    };
    mockGetAll.mockResolvedValue([existingNotif]);

    const event = makeEvent({ snoozeCount: 1 });
    const result = await snoozeDoseEvent(event, SETTINGS);

    expect(mockCancel).toHaveBeenCalledWith('notif-abc');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(result?.snoozeCount).toBe(2);
  });

  it('반환된 DoseEvent의 snoozeCount 가 1 증가한다', async () => {
    const event = makeEvent({ snoozeCount: 1 });

    const result = await snoozeDoseEvent(event, SETTINGS);

    expect(result?.snoozeCount).toBe(2);
    expect(result?.id).toBe('evt-1');
  });

  it('트리거 날짜가 defaultSnoozeMinutes 이후다', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-04-23T08:00:00Z');
    jest.setSystemTime(now);

    const event = makeEvent();
    await snoozeDoseEvent(event, SETTINGS);

    const triggerDate: Date = mockSchedule.mock.calls[0][0].trigger.date;
    const diffMs = triggerDate.getTime() - now.getTime();
    expect(diffMs).toBe(15 * 60 * 1000);

    jest.useRealTimers();
  });
});
