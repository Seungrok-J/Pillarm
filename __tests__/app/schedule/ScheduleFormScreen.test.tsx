/**
 * ScheduleFormScreen 통합 테스트
 *
 * AC1 — 저장 시 조용한 시간대 알림은 자동으로 quietHoursEnd 시점으로 이동된다
 * AC2 — 수정 시 기존 미래 DoseEvent는 삭제 후 재생성된다
 * AC3 — 종료일이 시작일보다 이전이면 저장 불가, 에러 메시지 표시
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => { React.useEffect(cb, [cb]); },
    useNavigation: jest.fn(),
    useRoute: jest.fn(),
  };
});

jest.mock('../../../src/db', () => ({
  upsertMedication: jest.fn().mockResolvedValue(undefined),
  upsertSchedule: jest.fn().mockResolvedValue(undefined),
  deleteFutureDoseEvents: jest.fn().mockResolvedValue(undefined),
  getMedicationById: jest.fn(),
  getScheduleById: jest.fn(),
}));

jest.mock('../../../src/notifications', () => ({
  scheduleForSchedule: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/store', () => ({
  useSettingsStore: jest.fn(),
}));

jest.mock('../../../src/utils', () => ({
  generateId: () => 'test-generated-id',
  todayString: () => '2026-04-22',
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import * as reactNavigation from '@react-navigation/native';
import * as db from '../../../src/db';
import * as notifications from '../../../src/notifications';
import { useSettingsStore } from '../../../src/store';
import ScheduleFormScreen from '../../../src/app/schedule/ScheduleFormScreen';
import type { UserSettings } from '../../../src/domain';

// ── Typed mock aliases ────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockUseNavigation = reactNavigation.useNavigation as jest.Mock;
const mockUseRoute = reactNavigation.useRoute as jest.Mock;
const mockUpsertMedication = db.upsertMedication as jest.Mock;
const mockUpsertSchedule = db.upsertSchedule as jest.Mock;
const mockDeleteFutureDoseEvents = db.deleteFutureDoseEvents as jest.Mock;
const mockGetMedicationById = db.getMedicationById as jest.Mock;
const mockGetScheduleById = db.getScheduleById as jest.Mock;
const mockScheduleForSchedule = notifications.scheduleForSchedule as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

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
  mealTimeBreakfast: '08:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '19:00',
};

const EXISTING_MED = {
  id: 'med-1',
  name: '기존약',
  dosageValue: 500,
  dosageUnit: 'mg',
  color: '#FF6B6B',
  isActive: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

const EXISTING_SCHED = {
  id: 'sched-1',
  medicationId: 'med-1',
  scheduleType: 'fixed' as const,
  startDate: '2026-04-01',
  times: ['08:00'],
  withFood: 'none' as const,
  graceMinutes: 120,
  isActive: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 폼에 최소 필수 항목(이름 + 시간 1개)을 채운다 */
async function fillRequiredFields(getByTestId: ReturnType<typeof render>['getByTestId']) {
  fireEvent.changeText(getByTestId('input-name'), '혈압약');
  fireEvent.press(getByTestId('btn-add-time'));
  fireEvent.changeText(getByTestId('input-time-value'), '08:00');
  fireEvent.press(getByTestId('btn-confirm-time'));
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockUseNavigation.mockReturnValue({ navigate: mockNavigate });
  mockUseRoute.mockReturnValue({ params: undefined }); // 기본: 신규 모드
  mockUseSettingsStore.mockImplementation(
    (selector: (s: { settings: UserSettings }) => unknown) =>
      selector({ settings: SETTINGS }),
  );

  mockGetMedicationById.mockResolvedValue(EXISTING_MED);
  mockGetScheduleById.mockResolvedValue(EXISTING_SCHED);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC3 — 종료일 검증 (가장 단순하므로 먼저)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC3 — 종료일 유효성 검사', () => {
  it('종료일이 시작일보다 이전이면 에러 메시지를 표시하고 저장하지 않는다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    await fillRequiredFields(getByTestId);
    fireEvent.changeText(getByTestId('input-start-date'), '2026-04-22');
    fireEvent.changeText(getByTestId('input-end-date'), '2026-04-21');

    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => {
      expect(getByTestId('error-endDate')).toBeTruthy();
    });
    expect(getByTestId('error-endDate').props.children).toBe(
      '종료일은 시작일 이후여야 합니다',
    );
    expect(mockUpsertMedication).not.toHaveBeenCalled();
    expect(mockScheduleForSchedule).not.toHaveBeenCalled();
  });

  it('종료일이 시작일과 같으면 저장한다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    await fillRequiredFields(getByTestId);
    fireEvent.changeText(getByTestId('input-start-date'), '2026-04-22');
    fireEvent.changeText(getByTestId('input-end-date'), '2026-04-22');

    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockScheduleForSchedule).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('Main');
  });

  it('약 이름이 없으면 name 에러를 표시하고 저장하지 않는다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    // 시간만 추가, 이름 없음
    fireEvent.press(getByTestId('btn-add-time'));
    fireEvent.changeText(getByTestId('input-time-value'), '08:00');
    fireEvent.press(getByTestId('btn-confirm-time'));
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(getByTestId('error-name')).toBeTruthy());
    expect(mockUpsertMedication).not.toHaveBeenCalled();
  });

  it('복용 시간이 없으면 times 에러를 표시하고 저장하지 않는다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    fireEvent.changeText(getByTestId('input-name'), '혈압약');
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(getByTestId('error-times')).toBeTruthy());
    expect(mockUpsertMedication).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — 조용한 시간대: scheduleForSchedule 에 settings 가 전달된다
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC1 — 조용한 시간대 알림 처리', () => {
  it('저장 시 scheduleForSchedule 에 quietHours 가 포함된 settings 가 전달된다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    fireEvent.changeText(getByTestId('input-name'), '혈압약');
    // 조용한 시간대(23:00-07:00) 안의 시각
    fireEvent.press(getByTestId('btn-add-time'));
    fireEvent.changeText(getByTestId('input-time-value'), '23:30');
    fireEvent.press(getByTestId('btn-confirm-time'));

    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockScheduleForSchedule).toHaveBeenCalledTimes(1));

    const [schedArg, , settingsArg] = mockScheduleForSchedule.mock.calls[0];
    expect(schedArg).toMatchObject({ times: ['23:30'] });
    expect(settingsArg).toMatchObject({
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
    });
  });

  it('저장 후 Home 으로 내비게이션한다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    await fillRequiredFields(getByTestId);
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Main'));
  });

  it('scheduleForSchedule 에 올바른 medication 이 전달된다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    fireEvent.changeText(getByTestId('input-name'), '혈압약');
    fireEvent.changeText(getByTestId('input-dosage-value'), '500');
    fireEvent.press(getByTestId('btn-add-time'));
    fireEvent.changeText(getByTestId('input-time-value'), '08:00');
    fireEvent.press(getByTestId('btn-confirm-time'));
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockScheduleForSchedule).toHaveBeenCalledTimes(1));

    const [, medArg] = mockScheduleForSchedule.mock.calls[0];
    expect(medArg).toMatchObject({
      name: '혈압약',
      dosageValue: 500,
      dosageUnit: 'mg',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — 수정 시 기존 DoseEvent 삭제 → 재생성
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC2 — 수정 모드 DoseEvent 재생성', () => {
  beforeEach(() => {
    // 수정 모드로 route 변경
    mockUseRoute.mockReturnValue({
      params: { scheduleId: 'sched-1', medicationId: 'med-1' },
    });
  });

  it('저장 시 deleteFutureDoseEvents 가 scheduleForSchedule 보다 먼저 호출된다', async () => {
    const callOrder: string[] = [];
    mockDeleteFutureDoseEvents.mockImplementation(async () => {
      callOrder.push('delete');
    });
    mockScheduleForSchedule.mockImplementation(async () => {
      callOrder.push('schedule');
    });

    const { getByTestId } = render(<ScheduleFormScreen />);

    // 기존 데이터 로딩 완료 대기 (input-name 에 '기존약' 이 채워짐)
    await waitFor(() =>
      expect(getByTestId('input-name').props.value).toBe('기존약'),
    );

    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(callOrder).toHaveLength(2));
    expect(callOrder).toEqual(['delete', 'schedule']);
  });

  it('deleteFutureDoseEvents 가 올바른 scheduleId 로 호출된다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    await waitFor(() =>
      expect(getByTestId('input-name').props.value).toBe('기존약'),
    );

    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() =>
      expect(mockDeleteFutureDoseEvents).toHaveBeenCalledWith('sched-1'),
    );
  });

  it('신규 모드에서는 deleteFutureDoseEvents 를 호출하지 않는다', async () => {
    // 신규 모드 (beforeEach 에서 override)
    mockUseRoute.mockReturnValue({ params: undefined });

    const { getByTestId } = render(<ScheduleFormScreen />);
    await fillRequiredFields(getByTestId);
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockScheduleForSchedule).toHaveBeenCalledTimes(1));
    expect(mockDeleteFutureDoseEvents).not.toHaveBeenCalled();
  });

  it('수정 모드에서 기존 medication 데이터가 폼에 로드된다', async () => {
    const { getByTestId } = render(<ScheduleFormScreen />);

    await waitFor(() => {
      expect(getByTestId('input-name').props.value).toBe('기존약');
      expect(getByTestId('input-dosage-value').props.value).toBe('500');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 신규 모드 — 기본 저장 흐름
// ═══════════════════════════════════════════════════════════════════════════════

describe('신규 모드 — 저장 흐름', () => {
  it('PRD 순서대로 upsertMedication → upsertSchedule → scheduleForSchedule 호출', async () => {
    const callOrder: string[] = [];
    mockUpsertMedication.mockImplementation(async () => { callOrder.push('med'); });
    mockUpsertSchedule.mockImplementation(async () => { callOrder.push('sched'); });
    mockScheduleForSchedule.mockImplementation(async () => { callOrder.push('notify'); });

    const { getByTestId } = render(<ScheduleFormScreen />);
    await fillRequiredFields(getByTestId);
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(callOrder).toHaveLength(3));
    expect(callOrder).toEqual(['med', 'sched', 'notify']);
  });

  it('저장 후 에러 없으면 에러 메시지가 없다', async () => {
    const { queryByTestId } = render(<ScheduleFormScreen />);
    const { getByTestId } = render(<ScheduleFormScreen />);

    await fillRequiredFields(getByTestId);
    fireEvent.press(getByTestId('btn-save'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(queryByTestId('error-form')).toBeNull();
  });
});

