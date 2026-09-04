/**
 * SettingsScreen 통합 테스트
 *
 * AC1 — 설정 로딩 중 ActivityIndicator 표시
 * AC2 — Stepper 증감 → updateSettings 호출
 * AC3 — TimeInput 유효한 값 blur → saveSetting 호출
 * AC4 — 조용한 시간 변경 → rescheduleAllSchedules 추가 호출
 * AC5 — TimeInput 잘못된 형식 → 원래 값으로 복원
 */

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

jest.mock('../../../src/store/authStore', () => ({
  useAuthStore: () => ({
    isLoggedIn: false, userEmail: null, userName: null, clearSession: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => { React.useEffect(cb, [cb]); },
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});

jest.mock('../../../src/db', () => ({
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
  getUserSettings: jest.fn(),
}));

jest.mock('../../../src/notifications', () => ({
  rescheduleAllSchedules: jest.fn().mockResolvedValue(undefined),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as db from '../../../src/db';
import * as notifications from '../../../src/notifications';
import { useSettingsStore } from '../../../src/store';
import SettingsScreen from '../../../src/app/settings/SettingsScreen';
import type { UserSettings } from '../../../src/domain';

const mockSave = db.saveUserSettings as jest.Mock;
const mockReschedule = notifications.rescheduleAllSchedules as jest.Mock;

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
  fontScale: 1.0,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: SETTINGS });
});

// ── AC1 — 로딩 ───────────────────────────────────────────────────────────────

describe('AC1 — 설정 로딩 중', () => {
  it('settings 가 null 이면 ActivityIndicator 를 표시한다', () => {
    useSettingsStore.setState({ settings: null });
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });
});

// ── AC2 — Stepper ─────────────────────────────────────────────────────────────

describe('AC2 — Stepper 증감', () => {
  it('미루기 시간 + 버튼 → 15 + 5 = 20분으로 업데이트', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('stepper-snooze-minutes-inc'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ defaultSnoozeMinutes: 20 }),
      ),
    );
  });

  it('미루기 횟수 - 버튼 → 3 - 1 = 2회로 업데이트', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('stepper-snooze-count-dec'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ maxSnoozeCount: 2 }),
      ),
    );
  });

  it('최솟값(5분)에서 - 버튼 비활성 → 호출 안 됨', () => {
    useSettingsStore.setState({ settings: { ...SETTINGS, defaultSnoozeMinutes: 5 } });
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('stepper-snooze-minutes-dec'));

    expect(mockSave).not.toHaveBeenCalled();
  });
});

// ── AC3 — 시간 선택(드럼롤 시트) ────────────────────────────────────────────

describe('AC3 — 시간 선택', () => {
  it('시간 버튼에 현재 값이 읽기 쉬운 형태로 표시된다', () => {
    const { getByTestId } = render(<SettingsScreen />);
    // 23:00 을 24시간제 그대로 보여주지 않는다
    expect(getByTestId('input-quiet-start')).toHaveTextContent('오후 11:00');
  });

  it('버튼을 누르면 시트가 열리고, 확인하면 저장된다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-quiet-start'));
    fireEvent.changeText(getByTestId('input-time-value'), '22:00');
    fireEvent.press(getByTestId('btn-confirm-time'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ quietHoursStart: '22:00' }),
      ),
    );
  });

  it('취소하면 저장하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-quiet-start'));
    fireEvent.changeText(getByTestId('input-time-value'), '22:00');
    fireEvent.press(getByTestId('btn-cancel-time'));

    await waitFor(() => expect(getByTestId('input-quiet-start')).toBeTruthy());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('같은 시간을 다시 고르면 저장하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-quiet-start'));
    fireEvent.press(getByTestId('btn-confirm-time'));   // 23:00 그대로

    await waitFor(() => expect(getByTestId('input-quiet-start')).toBeTruthy());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('식사 시간도 같은 방식으로 저장된다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-meal-breakfast'));
    fireEvent.changeText(getByTestId('input-time-value'), '07:30');
    fireEvent.press(getByTestId('btn-confirm-time'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ mealTimeBreakfast: '07:30' }),
      ),
    );
  });
});

// ── AC4 — 조용한 시간 변경 시 재스케줄링 ─────────────────────────────────────

describe('AC4 — 조용한 시간 변경 → rescheduleAllSchedules', () => {
  it('quietHoursStart 변경 시 rescheduleAllSchedules 를 호출한다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-quiet-start'));
    fireEvent.changeText(getByTestId('input-time-value'), '22:00');
    fireEvent.press(getByTestId('btn-confirm-time'));

    await waitFor(() => expect(mockReschedule).toHaveBeenCalledTimes(1));
  });

  it('식사 시간 변경은 rescheduleAllSchedules 를 호출하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('input-meal-lunch'));
    fireEvent.changeText(getByTestId('input-time-value'), '12:30');
    fireEvent.press(getByTestId('btn-confirm-time'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('snooze 시간 변경 시 rescheduleAllSchedules 를 호출하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('stepper-snooze-minutes-inc'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockReschedule).not.toHaveBeenCalled();
  });
});

// ── 글씨 크기 조절 ───────────────────────────────────────────────────────────

describe('글씨 크기 조절', () => {
  it('세 단계 버튼이 모두 렌더된다', () => {
    const { getByTestId } = render(<SettingsScreen />);

    expect(getByTestId('btn-font-scale-1')).toBeTruthy();
    expect(getByTestId('btn-font-scale-1.15')).toBeTruthy();
    expect(getByTestId('btn-font-scale-1.3')).toBeTruthy();
  });

  it('단계를 누르면 해당 배율로 저장된다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('btn-font-scale-1.3'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 1.3 }));
  });

  it('글씨 크기 변경은 알림을 재등록하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('btn-font-scale-1.15'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('현재 선택된 단계가 selected 로 표시된다', () => {
    useSettingsStore.setState({ settings: { ...SETTINGS, fontScale: 1.15 } });
    const { getByTestId } = render(<SettingsScreen />);

    expect(getByTestId('btn-font-scale-1.15').props.accessibilityState)
      .toMatchObject({ selected: true });
    expect(getByTestId('btn-font-scale-1').props.accessibilityState)
      .toMatchObject({ selected: false });
  });

  it('저장된 배율이 알 수 없는 값이면 보통(1.0)으로 표시한다', () => {
    // 예전 빌드나 손상된 값이 들어와도 UI 가 아무것도 선택하지 않은 상태가 되지 않아야 한다
    useSettingsStore.setState({ settings: { ...SETTINGS, fontScale: 2.5 } });
    const { getByTestId } = render(<SettingsScreen />);

    expect(getByTestId('btn-font-scale-1').props.accessibilityState)
      .toMatchObject({ selected: true });
  });
});
