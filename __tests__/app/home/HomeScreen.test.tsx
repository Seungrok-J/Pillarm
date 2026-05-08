/**
 * HomeScreen 통합 테스트
 *
 * AC1 — 오늘 날짜의 DoseEvent가 시간순으로 표시된다
 * AC2 — `복용` 탭 시 즉시 카드가 '완료' 상태로 변한다 (낙관적 업데이트)
 * AC3 — 미루기 버튼 탭 후 rescheduleSnooze 가 호출된다
 * AC4 — 모든 복용 완료 시 "오늘 복용을 모두 완료했어요! 🎉" 메시지 표시
 *
 * 전략:
 *   - 실제 Zustand 스토어 사용 (낙관적 업데이트 동작 보존)
 *   - DB / notifications 레이어만 mock
 *   - 각 테스트는 beforeEach 에서 스토어 state 를 직접 초기화
 *   - async 완료를 항상 waitFor 로 보장하여 테스트 간 오염 방지
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: jest.fn(),
    useFocusEffect: (cb: () => void) => { React.useEffect(cb, [cb]); },
  };
});

jest.mock('../../../src/db', () => ({
  getDoseEventsByDate: jest.fn(),
  getDoseEventsByDateRange: jest.fn().mockResolvedValue([]),
  updateDoseEventStatus: jest.fn().mockResolvedValue(undefined),
  updateDoseEventSnooze: jest.fn().mockResolvedValue(undefined),
  getAllMedications: jest.fn(),
  upsertMedication: jest.fn().mockResolvedValue(undefined),
  deleteMedication: jest.fn().mockResolvedValue(undefined),
  markOverdueEventsMissed: jest.fn().mockResolvedValue(undefined),
  markScheduledEventsLate: jest.fn().mockResolvedValue(undefined),
  updateDoseEventMemo: jest.fn().mockResolvedValue(undefined),
  getDatabase: jest.fn().mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../../src/notifications', () => ({
  checkAndMarkMissed: jest.fn().mockResolvedValue(undefined),
  rescheduleSnooze: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/notifications/scheduler', () => ({
  cancelNotificationForDoseEvent: jest.fn().mockResolvedValue(undefined),
  checkAndMarkMissed: jest.fn().mockResolvedValue(undefined),
  rescheduleSnooze: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/features/points/pointEngine', () => ({
  awardDoseTaken:  jest.fn().mockResolvedValue(null),
  awardStreakBonus: jest.fn().mockResolvedValue(null),
  awardPerfectWeek: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../src/utils', () => ({
  todayString: () => '2026-04-22',
  generateId: () => 'test-id',
  addMinutes: (d: Date, m: number) => new Date(d.getTime() + m * 60_000),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
  toLocalISOString: (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import * as reactNavigation from '@react-navigation/native';
import * as db from '../../../src/db';
import * as notifications from '../../../src/notifications';
import * as pointEngine from '../../../src/features/points/pointEngine';
import {
  useDoseEventStore,
  useMedicationStore,
  useSettingsStore,
} from '../../../src/store';
import HomeScreen from '../../../src/app/home/HomeScreen';
import type { DoseEvent, Medication, UserSettings } from '../../../src/domain';

// ── Typed aliases ─────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockCheckAndMarkMissed = notifications.checkAndMarkMissed as jest.Mock;
const mockRescheduleSnooze = notifications.rescheduleSnooze as jest.Mock;
const mockGetDoseEventsByDate = db.getDoseEventsByDate as jest.Mock;
const mockUpdateDoseEventStatus = db.updateDoseEventStatus as jest.Mock;
const mockUpdateDoseEventSnooze = db.updateDoseEventSnooze as jest.Mock;
const mockGetAllMedications = db.getAllMedications as jest.Mock;
const mockAwardStreakBonus = pointEngine.awardStreakBonus as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const MEDICATION: Medication = {
  id: 'med-1',
  name: '혈압약',
  isActive: true,
  createdAt: '2026-04-22T00:00:00Z',
  updatedAt: '2026-04-22T00:00:00Z',
};

// plannedAt 을 30분 후로 설정하여 항상 'active' 상태로 만듭니다.
function makePlannedAt(offsetMs = 30 * 60_000): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  );
}

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'evt-1',
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: makePlannedAt(),
    status: 'scheduled',
    snoozeCount: 0,
    source: 'notification',
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

// ── AppState spy helper ───────────────────────────────────────────────────────

let capturedAppStateHandler: ((state: string) => void) | undefined;

function spyAppState() {
  capturedAppStateHandler = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event: any, handler: any) => {
    if (event === 'change') capturedAppStateHandler = handler;
    return { remove: jest.fn() } as any;
  });
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // 스토어를 깨끗한 초기 상태로 리셋
  useDoseEventStore.setState({ todayEvents: [], isLoading: false, error: null });
  useMedicationStore.setState({ medications: [], isLoading: false, error: null });
  useSettingsStore.setState({ settings: SETTINGS });

  (reactNavigation.useNavigation as jest.Mock).mockReturnValue({ navigate: mockNavigate });

  // 기본 DB mock: 즉시 이벤트 1개 반환
  mockGetDoseEventsByDate.mockResolvedValue([makeEvent()]);
  mockGetAllMedications.mockResolvedValue([MEDICATION]);
  mockUpdateDoseEventStatus.mockResolvedValue(undefined);
  mockUpdateDoseEventSnooze.mockResolvedValue(undefined);

  spyAppState();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── 공통 헬퍼: 이벤트가 화면에 뜰 때까지 대기 ─────────────────────────────

async function waitForEvent(getByTestId: ReturnType<typeof render>['getByTestId'], id = 'evt-1') {
  await waitFor(() => expect(getByTestId(`card-${id}`)).toBeTruthy());
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — DoseEvent 시간순 표시
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC1 — DoseEvent 시간순 표시', () => {
  it('이벤트가 plannedAt 기준 오름차순으로 렌더링된다', async () => {
    const events = [
      makeEvent({ id: 'evt-c', plannedAt: '2026-04-22T20:00:00' }),
      makeEvent({ id: 'evt-a', plannedAt: '2026-04-22T08:00:00' }),
      makeEvent({ id: 'evt-b', plannedAt: '2026-04-22T13:00:00' }),
    ];
    mockGetDoseEventsByDate.mockResolvedValue(events);

    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByTestId('card-time-evt-a').props.children).toBe('08:00');
      expect(getByTestId('card-time-evt-b').props.children).toBe('13:00');
      expect(getByTestId('card-time-evt-c').props.children).toBe('20:00');
    });
  });

  it('약 이름이 medicationId 에 매핑되어 표시된다', async () => {
    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() =>
      expect(getByTestId('card-name-evt-1').props.children).toBe('혈압약'),
    );
  });

  it('이벤트 없으면 빈 메시지를 표시한다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([]);
    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('txt-empty')).toBeTruthy());
  });

  it('오늘 날짜(2026-04-22)로 fetchTodayEvents 가 호출된다', async () => {
    render(<HomeScreen />);
    await waitFor(() =>
      expect(mockGetDoseEventsByDate).toHaveBeenCalledWith('2026-04-22', expect.any(String)),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — 복용 버튼 낙관적 업데이트
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC2 — 복용 버튼 낙관적 업데이트', () => {
  it('복용 탭 시 즉시 완료 상태로 변한다', async () => {
    const { getByTestId } = render(<HomeScreen />);

    // 이벤트 로드 대기
    await waitForEvent(getByTestId);

    // 복용 버튼 탭
    fireEvent.press(getByTestId('btn-take-evt-1'));

    // 낙관적 업데이트: store 의 markTaken 이 set() 으로 즉시 상태를 갱신
    await waitFor(() => {
      expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('taken');
    });
  });

  it('updateDoseEventStatus 가 올바른 인자로 호출된다', async () => {
    const { getByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-take-evt-1'));

    await waitFor(() =>
      expect(mockUpdateDoseEventStatus).toHaveBeenCalledWith(
        'evt-1',
        'taken',
        expect.any(String),
      ),
    );
  });

  it('DB 오류 시 낙관적 업데이트가 롤백된다', async () => {
    mockUpdateDoseEventStatus.mockRejectedValue(new Error('DB error'));

    const { getByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-take-evt-1'));

    // 롤백 후 다시 'scheduled' 로 복구
    await waitFor(() => {
      expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('scheduled');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC3 — 미루기 후 알림 재발송
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC3 — 미루기 후 알림 재발송', () => {
  it('미루기 버튼 탭 시 rescheduleSnooze 가 호출된다', async () => {
    // displayState = 'late' 가 되려면 plannedAt이 과거여야 한다 (grace 이내)
    mockGetDoseEventsByDate.mockResolvedValue([makeEvent({ plannedAt: makePlannedAt(-30 * 60_000) })]);
    const { getByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-snooze-evt-1'));

    await waitFor(() =>
      expect(mockRescheduleSnooze).toHaveBeenCalledWith(
        'evt-1',
        SETTINGS.defaultSnoozeMinutes,
        expect.any(String),
      ),
    );
  });

  it('rescheduleSnooze 에 defaultSnoozeMinutes(15) 가 전달된다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([makeEvent({ plannedAt: makePlannedAt(-30 * 60_000) })]);
    const { getByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-snooze-evt-1'));

    await waitFor(() =>
      expect(mockRescheduleSnooze).toHaveBeenCalledWith(expect.any(String), 15, expect.any(String)),
    );
  });

  it('snoozeCount 가 maxSnoozeCount 이상이면 미루기 버튼이 없다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([
      makeEvent({ plannedAt: makePlannedAt(-30 * 60_000), snoozeCount: 3 }),
    ]);

    const { queryByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(queryByTestId('card-evt-1')).toBeTruthy());
    expect(queryByTestId('btn-snooze-evt-1')).toBeNull();
  });

  it('미루기 후 updateDoseEventSnooze 가 호출된다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([makeEvent({ plannedAt: makePlannedAt(-30 * 60_000) })]);
    const { getByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-snooze-evt-1'));

    await waitFor(() =>
      expect(mockUpdateDoseEventSnooze).toHaveBeenCalledWith('evt-1', 1, expect.any(String)),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC4 — 모든 복용 완료 축하 메시지
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC4 — 모든 복용 완료 축하 메시지', () => {
  it('모든 이벤트가 taken 이면 축하 메시지를 표시한다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([
      makeEvent({ id: 'evt-1', status: 'taken' }),
      makeEvent({ id: 'evt-2', status: 'taken', plannedAt: '2026-04-22T13:00:00' }),
    ]);

    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByTestId('banner-all-done')).toBeTruthy();
      expect(getByTestId('txt-all-done').props.children).toBe(
        '오늘 복용을 모두 완료했어요! 🎉',
      );
    });
  });

  it('missed + skipped 만 남아도 축하 메시지를 표시한다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([
      makeEvent({ id: 'evt-1', status: 'missed' }),
      makeEvent({ id: 'evt-2', status: 'skipped', plannedAt: '2026-04-22T13:00:00' }),
    ]);

    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('banner-all-done')).toBeTruthy());
  });

  it('scheduled 이벤트가 남아있으면 축하 메시지가 없다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([
      makeEvent({ id: 'evt-1', status: 'taken' }),
      makeEvent({ id: 'evt-2', status: 'scheduled', plannedAt: '2026-04-22T13:00:00' }),
    ]);

    const { queryByTestId } = render(<HomeScreen />);

    // 이벤트가 로드될 때까지 대기 후 배너 없음 확인
    await waitFor(() => expect(queryByTestId('card-evt-2')).toBeTruthy());
    expect(queryByTestId('banner-all-done')).toBeNull();
  });

  it('이벤트가 없으면 축하 메시지가 없다', async () => {
    mockGetDoseEventsByDate.mockResolvedValue([]);

    const { queryByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(queryByTestId('txt-empty')).toBeTruthy());
    expect(queryByTestId('banner-all-done')).toBeNull();
  });

  it('복용 버튼 탭 후 마지막 이벤트가 완료되면 축하 메시지가 뜬다', async () => {
    // 이벤트 1개(scheduled)
    const { getByTestId, queryByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    // 초기: 축하 메시지 없음
    expect(queryByTestId('banner-all-done')).toBeNull();

    // 복용 버튼 탭
    fireEvent.press(getByTestId('btn-take-evt-1'));

    // taken 으로 바뀐 후 축하 메시지 표시
    await waitFor(() => expect(getByTestId('banner-all-done')).toBeTruthy());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AppState — 포그라운드 복귀 시 이벤트 새로고침
// (checkAndMarkMissed 는 App.tsx 의 전역 AppState 리스너에서 처리됩니다)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AppState — 포그라운드 복귀 시 이벤트 새로고침', () => {
  it('active 전환 후 이벤트 목록을 새로고침한다', async () => {
    render(<HomeScreen />);
    await waitFor(() => expect(mockGetDoseEventsByDate).toHaveBeenCalledTimes(1));

    capturedAppStateHandler?.('background');
    capturedAppStateHandler?.('active');

    await waitFor(() =>
      expect(mockGetDoseEventsByDate).toHaveBeenCalledTimes(2),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FAB — ScheduleNew 화면으로 이동
// ═══════════════════════════════════════════════════════════════════════════════

describe('FAB', () => {
  it('+ 버튼 탭 시 ScheduleNew 화면으로 이동한다', async () => {
    const { getByTestId } = render(<HomeScreen />);

    fireEvent.press(getByTestId('btn-fab'));

    expect(mockNavigate).toHaveBeenCalledWith('ScheduleNew');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC5 — 7일 연속 달성 모달
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC5 — 7일 연속 달성 모달', () => {
  it('awardStreakBonus 가 non-null 반환 시 축하 모달이 표시된다', async () => {
    mockAwardStreakBonus.mockResolvedValueOnce({
      id: 'entry-streak', userId: 'local', reason: 'streak_7days',
      delta: 50, balance: 110, createdAt: '2026-05-08T09:00:00',
    });

    const { getByTestId, queryByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    expect(queryByTestId('btn-streak-confirm')).toBeNull();

    fireEvent.press(getByTestId('btn-take-evt-1'));

    await waitFor(() => expect(getByTestId('btn-streak-confirm')).toBeTruthy());
  });

  it('awardStreakBonus 가 null 반환 시 모달이 표시되지 않는다', async () => {
    mockAwardStreakBonus.mockResolvedValueOnce(null);

    const { getByTestId, queryByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-take-evt-1'));

    await waitFor(() =>
      expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('taken'),
    );
    expect(queryByTestId('btn-streak-confirm')).toBeNull();
  });

  it('확인 버튼 탭 시 모달이 닫힌다', async () => {
    mockAwardStreakBonus.mockResolvedValueOnce({
      id: 'entry-streak', userId: 'local', reason: 'streak_7days',
      delta: 50, balance: 110, createdAt: '2026-05-08T09:00:00',
    });

    const { getByTestId, queryByTestId } = render(<HomeScreen />);
    await waitForEvent(getByTestId);

    fireEvent.press(getByTestId('btn-take-evt-1'));
    await waitFor(() => expect(getByTestId('btn-streak-confirm')).toBeTruthy());

    fireEvent.press(getByTestId('btn-streak-confirm'));

    await waitFor(() => expect(queryByTestId('btn-streak-confirm')).toBeNull());
  });
});
