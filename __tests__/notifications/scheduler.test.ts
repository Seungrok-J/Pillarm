import {
  scheduleForSchedule,
  cancelForSchedule,
  rescheduleSnooze,
  checkAndMarkMissed,
} from '../../src/notifications/scheduler';
import { Schedule, Medication, UserSettings } from '../../src/domain';

// ── Mock 설정 ──────────────────────────────────────────────────────────────

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/db', () => ({
  insertDoseEvent: jest.fn().mockResolvedValue(undefined),
  markOverdueEventsMissed: jest.fn().mockResolvedValue(undefined),
  markScheduledEventsLate: jest.fn().mockResolvedValue(undefined),
  getDatabase: jest.fn().mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue(undefined),
  }),
}));

// generateId 는 예측 가능한 값으로 대체합니다.
let mockIdCounter = 0;
jest.mock('../../src/utils', () => ({
  generateId: () => `id-${++mockIdCounter}`,
}));

import * as Notifications from 'expo-notifications';
import * as db from '../../src/db';

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockGetAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockInsertDoseEvent = db.insertDoseEvent as jest.Mock;
const mockMarkMissed = db.markOverdueEventsMissed as jest.Mock;
const mockMarkLate = (db as unknown as Record<string, jest.Mock>).markScheduledEventsLate as jest.Mock;

// ── 픽스처 ─────────────────────────────────────────────────────────────────

const MEDICATION: Medication = {
  id: 'med-1',
  name: '혈압약',
  isActive: true,
  createdAt: '2026-04-22T00:00:00Z',
  updatedAt: '2026-04-22T00:00:00Z',
};

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

function makeSchedule(overrides?: Partial<Schedule>): Schedule {
  return {
    id: 'sched-1',
    medicationId: 'med-1',
    scheduleType: 'fixed',
    startDate: '2026-04-22',
    times: ['10:00'],
    withFood: 'none',
    graceMinutes: 30,
    isActive: true,
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

// 가짜 예약 알림 객체 생성 헬퍼
function fakeNotif(id: string, data: Record<string, unknown>) {
  return {
    identifier: id,
    content: {
      title: '테스트',
      body: '테스트',
      data,
    },
  };
}

// ── beforeEach ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockIdCounter = 0;
  mockGetAll.mockResolvedValue([]);
  // "현재 시각" = 2026-04-22 06:00 로컬 (타임존 독립적 로컬 시각 고정)
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 3, 22, 6, 0, 0)); // April 22, 06:00 로컬
});

afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// cancelForSchedule
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelForSchedule', () => {
  it('scheduleId 가 일치하는 알림만 취소한다', async () => {
    mockGetAll.mockResolvedValue([
      fakeNotif('n1', { scheduleId: 'sched-1' }),
      fakeNotif('n2', { scheduleId: 'sched-2' }), // 다른 스케줄
      fakeNotif('n3', { scheduleId: 'sched-1' }),
    ]);

    await cancelForSchedule('sched-1');

    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n3');
    expect(mockCancel).not.toHaveBeenCalledWith('n2');
  });

  it('취소 대상이 없으면 cancelScheduledNotificationAsync 를 호출하지 않는다', async () => {
    mockGetAll.mockResolvedValue([
      fakeNotif('n1', { scheduleId: 'other-sched' }),
    ]);

    await cancelForSchedule('sched-1');

    expect(mockCancel).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// scheduleForSchedule
// ═══════════════════════════════════════════════════════════════════════════

describe('scheduleForSchedule', () => {
  it('등록 전에 기존 알림을 먼저 취소한다', async () => {
    mockGetAll.mockResolvedValue([
      fakeNotif('old', { scheduleId: 'sched-1' }),
    ]);

    await scheduleForSchedule(makeSchedule({ times: ['10:00'] }), MEDICATION, SETTINGS);

    // cancelForSchedule 가 호출되어 old 를 취소했어야 함
    expect(mockCancel).toHaveBeenCalledWith('old');
  });

  it('endDate 까지만 알림을 등록한다', async () => {
    // endDate = 오늘+2일(April 24), times: ['10:00'] → 3일치(22,23,24) = 3개
    const endDate = '2026-04-24';
    await scheduleForSchedule(
      makeSchedule({ times: ['10:00'], endDate }),
      MEDICATION,
      SETTINGS,
    );

    expect(mockSchedule).toHaveBeenCalledTimes(3);
    expect(mockInsertDoseEvent).toHaveBeenCalledTimes(3);
  });

  it('현재 시각 이전의 plannedAt 은 건너뛴다', async () => {
    // 현재 = 06:00, 스케줄 time = '05:00' → 오늘 05:00 는 과거이므로 스킵
    // 오늘 05:00 는 건너뛰고 내일(23일)부터 endDate(24일)까지 2개 등록
    await scheduleForSchedule(
      makeSchedule({ times: ['05:00'], endDate: '2026-04-24' }),
      MEDICATION,
      SETTINGS,
    );

    expect(mockSchedule).toHaveBeenCalledTimes(2); // 23일, 24일만
  });

  it('daysOfWeek 필터를 적용한다', async () => {
    // April 22 = 수요일(3), April 23 = 목(4), April 24 = 금(5)
    // daysOfWeek: [3] → 수요일만 → 1개
    await scheduleForSchedule(
      makeSchedule({ times: ['10:00'], endDate: '2026-04-24', daysOfWeek: [3] }),
      MEDICATION,
      SETTINGS,
    );

    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('DoseEvent.plannedAt 은 조용한 시간대 조정 없이 원래 시각', async () => {
    // 23:30 은 조용한 시간대(23:00–07:00) 안이므로 알림 트리거는 다음날 07:00
    // 하지만 DoseEvent.plannedAt 은 여전히 23:30 이어야 함
    await scheduleForSchedule(
      makeSchedule({ times: ['23:30'], endDate: '2026-04-22' }),
      MEDICATION,
      SETTINGS,
    );

    const insertedEvent = mockInsertDoseEvent.mock.calls[0]?.[0];
    // plannedAt 은 April 22 23:30 (원래 시각)
    expect(insertedEvent.plannedAt).toContain('T23:30:00');
  });

  it('조용한 시간대 알림의 trigger 는 quietHoursEnd 시점으로 조정된다', async () => {
    // 23:30 → 다음 날(April 23) 07:00 으로 조정
    await scheduleForSchedule(
      makeSchedule({ times: ['23:30'], endDate: '2026-04-22' }),
      MEDICATION,
      SETTINGS,
    );

    const callArg = mockSchedule.mock.calls[0]?.[0];
    const triggerDate: Date = callArg.trigger.date;
    expect(triggerDate.getHours()).toBe(7);
    expect(triggerDate.getMinutes()).toBe(0);
    // 다음 날(April 23) 로 넘어가야 함
    expect(triggerDate.getDate()).toBe(23);
  });

  it('알림 data 에 scheduleId, medicationId, doseEventId 가 포함된다', async () => {
    await scheduleForSchedule(
      makeSchedule({ times: ['10:00'], endDate: '2026-04-22' }),
      MEDICATION,
      SETTINGS,
    );

    const content = mockSchedule.mock.calls[0]?.[0].content;
    expect(content.data).toMatchObject({
      scheduleId: 'sched-1',
      medicationId: 'med-1',
      doseEventId: expect.any(String),
    });
  });

  it('withFood=before 이면 body 가 "식전에 복용하세요"', async () => {
    await scheduleForSchedule(
      makeSchedule({ times: ['10:00'], endDate: '2026-04-22', withFood: 'before' }),
      MEDICATION,
      SETTINGS,
    );
    expect(mockSchedule.mock.calls[0]?.[0].content.body).toBe('식전에 복용하세요');
  });

  it('withFood=after 이면 body 가 "식후에 복용하세요"', async () => {
    await scheduleForSchedule(
      makeSchedule({ times: ['10:00'], endDate: '2026-04-22', withFood: 'after' }),
      MEDICATION,
      SETTINGS,
    );
    expect(mockSchedule.mock.calls[0]?.[0].content.body).toBe('식후에 복용하세요');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rescheduleSnooze
// ═══════════════════════════════════════════════════════════════════════════

describe('rescheduleSnooze', () => {
  it('doseEventId 와 일치하는 기존 알림을 취소한다', async () => {
    mockGetAll.mockResolvedValue([
      fakeNotif('n1', { doseEventId: 'evt-1' }),
      fakeNotif('n2', { doseEventId: 'evt-2' }),
    ]);

    await rescheduleSnooze('evt-1', 15, new Date().toISOString());

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).not.toHaveBeenCalledWith('n2');
  });

  it('기존 알림이 없어도 새 알림을 등록한다', async () => {
    mockGetAll.mockResolvedValue([]);

    await rescheduleSnooze('evt-99', 15, new Date().toISOString());

    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('새 알림의 trigger 는 basePlannedAt + snoozeMinutes', async () => {
    const base = new Date();
    base.setHours(6, 0, 0, 0);
    await rescheduleSnooze('evt-1', 15, base.toISOString());

    const triggerDate: Date = mockSchedule.mock.calls[0]?.[0].trigger.date;
    expect(triggerDate.getHours()).toBe(6);
    expect(triggerDate.getMinutes()).toBe(15);
  });

  it('기존 알림 content 를 이어받아 doseEventId 를 data 에 유지한다', async () => {
    mockGetAll.mockResolvedValue([
      {
        identifier: 'n1',
        content: {
          title: '혈압약 복용 시간이에요',
          body: '식후에 복용하세요',
          data: { doseEventId: 'evt-1', scheduleId: 'sched-1' },
        },
      },
    ]);

    await rescheduleSnooze('evt-1', 15, new Date().toISOString());

    const content = mockSchedule.mock.calls[0]?.[0].content;
    expect(content.title).toBe('혈압약 복용 시간이에요');
    expect(content.data).toMatchObject({ doseEventId: 'evt-1' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkAndMarkMissed
// ═══════════════════════════════════════════════════════════════════════════

describe('checkAndMarkMissed', () => {
  it('markOverdueEventsMissed 를 (now - missedToLateMinutes) 기준으로 호출한다', async () => {
    await checkAndMarkMissed(SETTINGS);

    expect(mockMarkMissed).toHaveBeenCalledTimes(1);
    const cutoffDate = new Date(mockMarkMissed.mock.calls[0]?.[0] as string);
    const expected = new Date(Date.now() - 120 * 60_000);
    expect(Math.abs(cutoffDate.getTime() - expected.getTime())).toBeLessThan(1000);

    expect(mockMarkLate).toHaveBeenCalledTimes(1);
    const lateNowDate = new Date(mockMarkLate.mock.calls[0]?.[0] as string);
    expect(Math.abs(lateNowDate.getTime() - Date.now())).toBeLessThan(1000);
  });

  it('missedToLateMinutes=60 이면 cutoff 가 1시간 전', async () => {
    await checkAndMarkMissed({ ...SETTINGS, missedToLateMinutes: 60 });

    const cutoffDate = new Date(mockMarkMissed.mock.calls[0]?.[0] as string);
    const expected = new Date(Date.now() - 60 * 60_000);
    expect(Math.abs(cutoffDate.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});
