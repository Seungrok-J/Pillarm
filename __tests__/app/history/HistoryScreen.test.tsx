/**
 * HistoryScreen 통합 테스트
 *
 * AC1 — 날짜 탭 시 해당 날짜 DoseEvent 목록이 표시된다
 * AC2 — 오늘 날짜 한정으로 미처리 DoseEvent에 '늦은 복용 처리' 버튼이 표시된다
 *
 * 전략:
 *   - react-native-calendars 를 mock 하여 onDayPress 를 직접 호출
 *   - DB / notifications 만 mock, 실제 Zustand 스토어 사용
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── react-native-calendars mock ───────────────────────────────────────────────
// Jest 호이스팅 규칙 준수: mock 접두사 변수만 factory 내에서 사용 가능

const mockCalendarHandlers: {
  onDayPress?: (day: { dateString: string }) => void;
  onMonthChange?: (month: { dateString: string }) => void;
} = {};

jest.mock('react-native-calendars', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Calendar: (props: any) => {
      mockCalendarHandlers.onDayPress = props.onDayPress;
      mockCalendarHandlers.onMonthChange = props.onMonthChange;
      return React.createElement(View, { testID: 'calendar' });
    },
  };
});

// ── notifications mock (scheduleStore 가 cancelForSchedule 을 임포트하므로 필요) ──

jest.mock('../../../src/notifications', () => ({
  cancelForSchedule: jest.fn().mockResolvedValue(undefined),
}));

// ── DB / notifications mock ───────────────────────────────────────────────────

jest.mock('../../../src/db', () => ({
  getDoseEventsByDateRange: jest.fn(),
  updateDoseEventStatus: jest.fn().mockResolvedValue(undefined),
  getAllMedications: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../src/utils', () => ({
  todayString: () => '2026-04-23',
  generateId: () => 'test-id',
  addMinutes: (d: Date, m: number) => new Date(d.getTime() + m * 60_000),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import * as db from '../../../src/db';
import { useDoseEventStore, useMedicationStore } from '../../../src/store';
import HistoryScreen from '../../../src/app/history/HistoryScreen';
import type { DoseEvent, Medication } from '../../../src/domain';

// ── 타입별 aliases ────────────────────────────────────────────────────────────

const mockGetDoseEventsByDateRange = db.getDoseEventsByDateRange as jest.Mock;
const mockUpdateDoseEventStatus = db.updateDoseEventStatus as jest.Mock;
const mockGetAllMedications = db.getAllMedications as jest.Mock;

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const TODAY = '2026-04-23';
const PAST  = '2026-04-10';

const MED: Medication = {
  id: 'med-1',
  name: '혈압약',
  isActive: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'evt-1',
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: `${TODAY}T08:00:00`,
    status: 'scheduled',
    snoozeCount: 0,
    source: 'notification',
    createdAt: `${TODAY}T00:00:00Z`,
    updatedAt: `${TODAY}T00:00:00Z`,
    ...overrides,
  };
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCalendarHandlers.onDayPress = undefined;
  mockCalendarHandlers.onMonthChange = undefined;

  useDoseEventStore.setState({ todayEvents: [], isLoading: false, error: null });
  useMedicationStore.setState({ medications: [MED], isLoading: false, error: null });

  mockGetAllMedications.mockResolvedValue([MED]);
  mockGetDoseEventsByDateRange.mockResolvedValue([makeEvent()]);
  mockUpdateDoseEventStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function renderAndWait() {
  const utils = render(<HistoryScreen />);
  // 초기 월 로드 완료 대기
  await waitFor(() =>
    expect(mockGetDoseEventsByDateRange).toHaveBeenCalled(),
  );
  return utils;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — 날짜 탭 시 해당 날짜 DoseEvent 목록 표시
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC1 — 날짜 탭 시 해당 날짜 DoseEvent 목록 표시', () => {
  it('초기 렌더 시 오늘 날짜 이벤트가 표시된다', async () => {
    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId(`history-card-evt-1`)).toBeTruthy(),
    );
    expect(getByTestId('history-time-evt-1').props.children).toBe('08:00');
    expect(getByTestId('history-name-evt-1').props.children).toBe('혈압약');
  });

  it('다른 날짜의 이벤트는 표시되지 않는다', async () => {
    const events = [
      makeEvent({ id: 'evt-today', plannedAt: `${TODAY}T08:00:00` }),
      makeEvent({ id: 'evt-past',  plannedAt: `${PAST}T08:00:00`  }),
    ];
    mockGetDoseEventsByDateRange.mockResolvedValue(events);

    const { queryByTestId } = await renderAndWait();

    // 오늘 이벤트는 보임
    await waitFor(() =>
      expect(queryByTestId('history-card-evt-today')).toBeTruthy(),
    );
    // 과거 이벤트는 안 보임 (다른 날짜)
    expect(queryByTestId('history-card-evt-past')).toBeNull();
  });

  it('다른 날짜를 탭하면 해당 날짜 이벤트가 표시된다', async () => {
    const events = [
      makeEvent({ id: 'evt-today', plannedAt: `${TODAY}T08:00:00` }),
      makeEvent({ id: 'evt-past',  plannedAt: `${PAST}T08:00:00`  }),
    ];
    mockGetDoseEventsByDateRange.mockResolvedValue(events);

    const { queryByTestId } = await renderAndWait();

    // 초기: 오늘 이벤트만 보임
    await waitFor(() =>
      expect(queryByTestId('history-card-evt-today')).toBeTruthy(),
    );
    expect(queryByTestId('history-card-evt-past')).toBeNull();

    // 과거 날짜 탭
    act(() => {
      mockCalendarHandlers.onDayPress?.({ dateString: PAST });
    });

    // 과거 이벤트만 보임
    await waitFor(() =>
      expect(queryByTestId('history-card-evt-past')).toBeTruthy(),
    );
    expect(queryByTestId('history-card-evt-today')).toBeNull();
  });

  it('선택 날짜에 이벤트 없으면 빈 메시지를 표시한다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() => expect(getByTestId('txt-no-events')).toBeTruthy());
  });

  it('이벤트가 시간순으로 정렬된다', async () => {
    const events = [
      makeEvent({ id: 'evt-c', plannedAt: `${TODAY}T20:00:00` }),
      makeEvent({ id: 'evt-a', plannedAt: `${TODAY}T08:00:00` }),
      makeEvent({ id: 'evt-b', plannedAt: `${TODAY}T13:00:00` }),
    ];
    mockGetDoseEventsByDateRange.mockResolvedValue(events);

    const { getByTestId } = await renderAndWait();

    await waitFor(() => {
      expect(getByTestId('history-time-evt-a').props.children).toBe('08:00');
      expect(getByTestId('history-time-evt-b').props.children).toBe('13:00');
      expect(getByTestId('history-time-evt-c').props.children).toBe('20:00');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — 오늘 날짜 한정 '늦은 복용 처리' 버튼
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC2 — 오늘 날짜 한정 늦은 복용 처리 버튼', () => {
  it('오늘 날짜의 scheduled 이벤트에 버튼이 표시된다', async () => {
    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('btn-late-take-evt-1')).toBeTruthy(),
    );
  });

  it('오늘 날짜의 late 이벤트에도 버튼이 표시된다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'late' }),
    ]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('btn-late-take-evt-1')).toBeTruthy(),
    );
  });

  it('오늘 날짜의 taken 이벤트에는 버튼이 없다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'taken' }),
    ]);

    const { queryByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(queryByTestId('history-card-evt-1')).toBeTruthy(),
    );
    expect(queryByTestId('btn-late-take-evt-1')).toBeNull();
  });

  it('과거 날짜로 전환하면 버튼이 사라진다', async () => {
    const events = [
      makeEvent({ id: 'evt-today', plannedAt: `${TODAY}T08:00:00`, status: 'scheduled' }),
      makeEvent({ id: 'evt-past',  plannedAt: `${PAST}T08:00:00`,  status: 'scheduled' }),
    ];
    mockGetDoseEventsByDateRange.mockResolvedValue(events);

    const { queryByTestId } = await renderAndWait();

    // 오늘: 버튼 있음
    await waitFor(() =>
      expect(queryByTestId('btn-late-take-evt-today')).toBeTruthy(),
    );

    // 과거 날짜로 이동
    act(() => {
      mockCalendarHandlers.onDayPress?.({ dateString: PAST });
    });

    await waitFor(() =>
      expect(queryByTestId('history-card-evt-past')).toBeTruthy(),
    );
    // 과거 날짜: 버튼 없음
    expect(queryByTestId('btn-late-take-evt-past')).toBeNull();
  });

  it('버튼 탭 시 updateDoseEventStatus 가 taken 으로 호출된다', async () => {
    const { getByTestId } = await renderAndWait();

    await waitFor(() => expect(getByTestId('btn-late-take-evt-1')).toBeTruthy());

    fireEvent.press(getByTestId('btn-late-take-evt-1'));

    await waitFor(() =>
      expect(mockUpdateDoseEventStatus).toHaveBeenCalledWith(
        'evt-1',
        'taken',
        expect.any(String),
      ),
    );
  });

  it('버튼 탭 후 이벤트 상태가 taken 으로 바뀐다 (낙관적 업데이트)', async () => {
    const { getByTestId, queryByTestId } = await renderAndWait();

    await waitFor(() => expect(getByTestId('btn-late-take-evt-1')).toBeTruthy());

    fireEvent.press(getByTestId('btn-late-take-evt-1'));

    // 낙관적 업데이트로 버튼이 즉시 사라짐 (taken → showLateBtn = false)
    await waitFor(() =>
      expect(queryByTestId('btn-late-take-evt-1')).toBeNull(),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 월 네비게이션
// ═══════════════════════════════════════════════════════════════════════════════

describe('월 네비게이션', () => {
  it('이전 달 버튼 탭 시 label-month 가 바뀐다', async () => {
    const { getByTestId } = await renderAndWait();

    expect(getByTestId('label-month').props.children).toBe('2026년 4월');

    fireEvent.press(getByTestId('btn-prev-month'));

    await waitFor(() =>
      expect(getByTestId('label-month').props.children).toBe('2026년 3월'),
    );
  });

  it('다음 달 버튼 탭 시 label-month 가 바뀐다', async () => {
    const { getByTestId } = await renderAndWait();

    fireEvent.press(getByTestId('btn-next-month'));

    await waitFor(() =>
      expect(getByTestId('label-month').props.children).toBe('2026년 5월'),
    );
  });

  it('월 변경 시 getDoseEventsByDateRange 를 새 범위로 재호출한다', async () => {
    await renderAndWait();

    // 초기 로드
    expect(mockGetDoseEventsByDateRange).toHaveBeenCalledWith(
      '2026-04-01T00:00:00',
      '2026-05-01T00:00:00',
    );

    // 다음 달
    await act(async () => {
      mockCalendarHandlers.onMonthChange?.({ dateString: '2026-05-01' });
    });

    await waitFor(() =>
      expect(mockGetDoseEventsByDateRange).toHaveBeenCalledWith(
        '2026-05-01T00:00:00',
        '2026-06-01T00:00:00',
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DayDot 유틸 함수 단위 테스트
// ═══════════════════════════════════════════════════════════════════════════════

import { getDotColor } from '../../../src/components/DayDot';

describe('getDotColor', () => {
  it('이벤트 없으면 null 반환', () => {
    expect(getDotColor(0, 0)).toBeNull();
  });
  it('100% → 초록', () => {
    expect(getDotColor(3, 3)).toBe('#22c55e');
  });
  it('50~99% → 노랑', () => {
    expect(getDotColor(2, 1)).toBe('#eab308');
  });
  it('1~49% → 주황', () => {
    expect(getDotColor(3, 1)).toBe('#f97316');
  });
  it('0% (이벤트 있음) → 빨강', () => {
    expect(getDotColor(2, 0)).toBe('#ef4444');
  });
});
