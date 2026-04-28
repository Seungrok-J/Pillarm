/**
 * StatsScreen 통합 테스트
 *
 * AC1 — 주간/월간 탭 전환 시 데이터 즉시 반영
 * AC2 — 완료율 = taken / (taken + missed + late) (statsCalculator 단위 테스트로 검증)
 * AC3 — 주간 누락 0건 시 "이번 주 완벽해요! 🏆" 메시지 표시
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── react-native-svg mock ─────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

// CoachingSection은 자체 DB 쿼리와 AsyncStorage를 사용하므로
// StatsScreen 단위 테스트에서는 null 컴포넌트로 대체한다.
jest.mock('../../../src/features/aiCoaching/CoachingSection', () => () => null);

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, { testID: 'svg' }, children),
    Circle: () => React.createElement(View, null),
    G: ({ children }: any) => React.createElement(View, null, children),
  };
});

// ── notifications mock (scheduleStore 가 cancelForSchedule 을 임포트하므로 필요) ──

jest.mock('../../../src/notifications', () => ({
  cancelForSchedule: jest.fn().mockResolvedValue(undefined),
}));

// ── DB mock ───────────────────────────────────────────────────────────────────

jest.mock('../../../src/db', () => ({
  getDoseEventsByDateRange: jest.fn(),
  getAllMedications:        jest.fn().mockResolvedValue([]),
  getAllSchedules:          jest.fn().mockResolvedValue([]),
}));

// ── Utils mock (날짜 고정) ────────────────────────────────────────────────────

jest.mock('../../../src/utils', () => ({
  ...jest.requireActual('../../../src/utils/statsCalculator'),
  todayString: () => '2026-04-23',
  generateId: () => 'test-id',
  addMinutes: (d: Date, m: number) => new Date(d.getTime() + m * 60_000),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import * as db from '../../../src/db';
import { useDoseEventStore, useMedicationStore } from '../../../src/store';
import StatsScreen from '../../../src/app/stats/StatsScreen';
import type { DoseEvent } from '../../../src/domain';

const mockGetDoseEventsByDateRange = db.getDoseEventsByDateRange as jest.Mock;

// ── 픽스처 ────────────────────────────────────────────────────────────────────

// 2026-04-23 기준: 이번 주 2026-04-20 ~ 2026-04-26, 이번 달 2026-04-01 ~ 2026-04-30

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: `evt-${Math.random()}`,
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: '2026-04-23T08:00:00',
    status: 'taken',
    snoozeCount: 0,
    source: 'notification',
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
    ...overrides,
  };
}

// ── 날짜 고정 ─────────────────────────────────────────────────────────────────
// StatsScreen 은 new Date() 로 범위를 계산하므로 시스템 시간을 고정

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-04-23T10:00:00'));
});

afterAll(() => {
  jest.useRealTimers();
});

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  useDoseEventStore.setState({ todayEvents: [], isLoading: false, error: null });
  useMedicationStore.setState({ medications: [], isLoading: false, error: null });
  mockGetDoseEventsByDateRange.mockResolvedValue([makeEvent()]);
});

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function renderAndWait() {
  const utils = render(<StatsScreen />);
  await waitFor(() =>
    expect(mockGetDoseEventsByDateRange).toHaveBeenCalled(),
  );
  return utils;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — 주간/월간 탭 전환 시 데이터 즉시 반영
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC1 — 탭 전환 시 데이터 반영', () => {
  it('초기 로드 시 "이번 주" 데이터를 조회한다', async () => {
    await renderAndWait();

    // 주간 범위: 2026-04-20 ~ 2026-04-26
    expect(mockGetDoseEventsByDateRange).toHaveBeenCalledWith(
      '2026-04-20T00:00:00',
      '2026-04-26T23:59:59',
    );
  });

  it('"이번 달" 탭 탭 시 월간 범위로 재조회한다', async () => {
    const { getByTestId } = await renderAndWait();

    fireEvent.press(getByTestId('tab-month'));

    await waitFor(() =>
      expect(mockGetDoseEventsByDateRange).toHaveBeenCalledWith(
        '2026-04-01T00:00:00',
        '2026-04-30T23:59:59',
      ),
    );
  });

  it('"이번 달" → "이번 주" 전환 시 다시 주간 범위로 조회한다', async () => {
    const { getByTestId } = await renderAndWait();

    fireEvent.press(getByTestId('tab-month'));
    await waitFor(() => expect(mockGetDoseEventsByDateRange).toHaveBeenCalledTimes(2));

    fireEvent.press(getByTestId('tab-week'));
    await waitFor(() => expect(mockGetDoseEventsByDateRange).toHaveBeenCalledTimes(3));

    // 세 번째 호출은 주간 범위
    const calls = mockGetDoseEventsByDateRange.mock.calls;
    expect(calls[2][0]).toBe('2026-04-20T00:00:00');
  });

  it('탭 전환 후 표시 데이터가 바뀐다', async () => {
    // 주간: taken 1건
    mockGetDoseEventsByDateRange.mockResolvedValueOnce([makeEvent({ status: 'taken' })]);
    // 월간: taken 5건
    const monthEvents = Array.from({ length: 5 }, () => makeEvent({ status: 'taken' }));
    mockGetDoseEventsByDateRange.mockResolvedValueOnce(monthEvents);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('txt-count-summary').props.children).toEqual(
        expect.arrayContaining(['완료 ', 1, '건 / 전체 ', 1, '건']),
      ),
    );

    fireEvent.press(getByTestId('tab-month'));

    await waitFor(() =>
      expect(getByTestId('txt-count-summary').props.children).toEqual(
        expect.arrayContaining(['완료 ', 5, '건 / 전체 ', 5, '건']),
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC3 — 주간 누락 0건 시 완벽 메시지
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC3 — 주간 누락 0건 완벽 메시지', () => {
  it('주간 탭 + 모두 taken → "이번 주 완벽해요! 🏆" 표시', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'taken' }),
    ]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('txt-perfect-week')).toBeTruthy(),
    );
    expect(getByTestId('txt-perfect-week').props.children).toBe(
      '이번 주 완벽해요! 🏆',
    );
  });

  it('주간 탭 + missed 있으면 메시지 없다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'missed' }),
    ]);

    const { queryByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(queryByTestId('txt-count-summary')).toBeTruthy(),
    );
    expect(queryByTestId('txt-perfect-week')).toBeNull();
  });

  it('이벤트 없으면 완벽 메시지 없다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([]);

    const { queryByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(queryByTestId('txt-count-summary')).toBeTruthy(),
    );
    expect(queryByTestId('txt-perfect-week')).toBeNull();
  });

  it('월간 탭에서는 모두 taken 이어도 완벽 메시지가 없다', async () => {
    // 첫 호출(주간) → taken 1건
    mockGetDoseEventsByDateRange.mockResolvedValueOnce([makeEvent({ status: 'taken' })]);
    // 두 번째 호출(월간) → 모두 taken
    mockGetDoseEventsByDateRange.mockResolvedValueOnce([
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'taken' }),
    ]);

    const { getByTestId, queryByTestId } = await renderAndWait();

    fireEvent.press(getByTestId('tab-month'));

    // 월간 데이터 로드 완료 대기
    await waitFor(() => expect(mockGetDoseEventsByDateRange).toHaveBeenCalledTimes(2));

    // "이번 달" 탭에서는 완벽 메시지 없음
    await waitFor(() =>
      expect(queryByTestId('txt-perfect-week')).toBeNull(),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — 완료율 계산 (UI 반영 확인)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC2 — 완료율 계산 UI 반영', () => {
  it('taken 2 / total 4 → gauge-percentage 가 50% 를 표시한다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'missed' }),
      makeEvent({ status: 'late' }),
    ]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('gauge-percentage').props.children).toBe('50%'),
    );
  });

  it('scheduled·skipped 는 완료율 계산에서 제외된다', async () => {
    // taken 1, scheduled 10 → 실제 total 은 1, completionRate 1.0 → 100%
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'taken' }),
      ...Array.from({ length: 10 }, () => makeEvent({ status: 'scheduled' })),
    ]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('gauge-percentage').props.children).toBe('100%'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 누락 패턴 TOP 3 표시
// ═══════════════════════════════════════════════════════════════════════════════

describe('누락 패턴 표시', () => {
  it('missed 없으면 "누락 없음" 메시지를 표시한다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([makeEvent({ status: 'taken' })]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('txt-no-missed-patterns')).toBeTruthy(),
    );
  });

  it('누락 패턴이 count 내림차순으로 표시된다', async () => {
    mockGetDoseEventsByDateRange.mockResolvedValue([
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T13:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-21T13:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-21T13:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T08:00:00' }),
    ]);

    const { getByTestId } = await renderAndWait();

    await waitFor(() =>
      expect(getByTestId('missed-slot-0').props.children).toBe('13:00'),
    );
    expect(getByTestId('missed-count-0').props.children).toBe('3회');
    expect(getByTestId('missed-slot-1').props.children).toBe('08:00');
  });
});
