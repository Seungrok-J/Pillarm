/**
 * SettingsScreen 통합 테스트
 *
 * AC1 — 설정 로딩 중 ActivityIndicator 표시
 * AC2 — Stepper 증감 → updateSettings 호출
 * AC3 — TimeInput 유효한 값 blur → saveSetting 호출
 * AC4 — 조용한 시간 변경 → rescheduleAllSchedules 추가 호출
 * AC5 — TimeInput 잘못된 형식 → 원래 값으로 복원
 */

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

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

// ── AC3 — TimeInput 유효 ──────────────────────────────────────────────────────

describe('AC3 — TimeInput 유효한 값', () => {
  it('유효한 시간 입력 blur → updateSettings 호출', async () => {
    const { getByTestId } = render(<SettingsScreen />);
    const input = getByTestId('input-quiet-start');

    fireEvent.changeText(input, '22:00');
    fireEvent(input, 'blur');

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ quietHoursStart: '22:00' }),
      ),
    );
  });
});

// ── AC4 — 조용한 시간 변경 시 재스케줄링 ─────────────────────────────────────

describe('AC4 — 조용한 시간 변경 → rescheduleAllSchedules', () => {
  it('quietHoursStart 변경 시 rescheduleAllSchedules 를 호출한다', async () => {
    const { getByTestId } = render(<SettingsScreen />);
    const input = getByTestId('input-quiet-start');

    fireEvent.changeText(input, '22:00');
    fireEvent(input, 'blur');

    await waitFor(() => expect(mockReschedule).toHaveBeenCalledTimes(1));
  });

  it('snooze 시간 변경 시 rescheduleAllSchedules 를 호출하지 않는다', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('stepper-snooze-minutes-inc'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockReschedule).not.toHaveBeenCalled();
  });
});

// ── AC5 — TimeInput 잘못된 형식 ──────────────────────────────────────────────

describe('AC5 — TimeInput 잘못된 형식', () => {
  it('잘못된 시간 blur → 원래 값으로 복원, updateSettings 호출 안 함', async () => {
    const { getByTestId } = render(<SettingsScreen />);
    const input = getByTestId('input-quiet-start');

    fireEvent.changeText(input, 'ab:cd');
    fireEvent(input, 'blur');

    await waitFor(() =>
      expect(input.props.value).toBe('23:00'),
    );
    expect(mockSave).not.toHaveBeenCalled();
  });
});
