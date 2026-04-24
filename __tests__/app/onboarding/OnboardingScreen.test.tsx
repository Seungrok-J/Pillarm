/**
 * OnboardingScreen 통합 테스트
 *
 * AC1 — 초기 렌더: 첫 슬라이드 + 다음 버튼 표시
 * AC2 — 다음 버튼 2회 탭 → 시작하기 버튼으로 전환
 * AC3 — 시작하기 탭 → 알림 권한 요청 + AsyncStorage 저장 + onComplete 호출
 * AC4 — 페이지 도트 개수와 슬라이드 수가 일치
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../src/notifications', () => ({
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as notifications from '../../../src/notifications';
import OnboardingScreen, {
  ONBOARDING_KEY,
} from '../../../src/app/onboarding/OnboardingScreen';

const mockOnComplete = jest.fn();
const mockRequestPermission = notifications.requestNotificationPermission as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('AC1 — 초기 렌더', () => {
  it('온보딩 화면이 렌더링된다', () => {
    const { getByTestId } = render(<OnboardingScreen onComplete={mockOnComplete} />);
    expect(getByTestId('screen-onboarding')).toBeTruthy();
  });

  it('초기에는 "다음" 버튼이 표시된다', () => {
    const { getByTestId, queryByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} />,
    );
    expect(getByTestId('btn-next')).toBeTruthy();
    expect(queryByTestId('btn-start')).toBeNull();
  });

  it('슬라이드 목록이 렌더링된다', () => {
    const { getByTestId } = render(<OnboardingScreen onComplete={mockOnComplete} />);
    expect(getByTestId('onboarding-slides')).toBeTruthy();
  });
});

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('AC2 — 슬라이드 탐색', () => {
  it('다음 버튼 2회 탭 후 "시작하기" 버튼이 표시된다', async () => {
    const { getByTestId, queryByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} />,
    );

    fireEvent.press(getByTestId('btn-next'));
    await waitFor(() => expect(queryByTestId('btn-next')).toBeTruthy());

    fireEvent.press(getByTestId('btn-next'));
    await waitFor(() => expect(getByTestId('btn-start')).toBeTruthy());
    expect(queryByTestId('btn-next')).toBeNull();
  });

  it('페이지 도트가 3개 렌더링된다', () => {
    const { getByTestId } = render(<OnboardingScreen onComplete={mockOnComplete} />);
    expect(getByTestId('dot-0')).toBeTruthy();
    expect(getByTestId('dot-1')).toBeTruthy();
    expect(getByTestId('dot-2')).toBeTruthy();
  });
});

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('AC3 — 시작하기 버튼', () => {
  async function navigateToLast() {
    const utils = render(<OnboardingScreen onComplete={mockOnComplete} />);
    fireEvent.press(utils.getByTestId('btn-next'));
    await waitFor(() => expect(utils.queryByTestId('btn-next')).toBeTruthy());
    fireEvent.press(utils.getByTestId('btn-next'));
    await waitFor(() => expect(utils.getByTestId('btn-start')).toBeTruthy());
    return utils;
  }

  it('requestNotificationPermission 을 호출한다', async () => {
    const { getByTestId } = await navigateToLast();

    fireEvent.press(getByTestId('btn-start'));

    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
  });

  it('AsyncStorage 에 onboarding_done = "true" 를 저장한다', async () => {
    const { getByTestId } = await navigateToLast();

    fireEvent.press(getByTestId('btn-start'));

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(ONBOARDING_KEY, 'true'),
    );
  });

  it('onComplete 콜백을 호출한다', async () => {
    const { getByTestId } = await navigateToLast();

    fireEvent.press(getByTestId('btn-start'));

    await waitFor(() => expect(mockOnComplete).toHaveBeenCalledTimes(1));
  });
});

// ── AC4 ───────────────────────────────────────────────────────────────────────

describe('AC4 — 접근성', () => {
  it('슬라이드 1~3이 testID로 접근 가능하다', () => {
    const { getByTestId } = render(<OnboardingScreen onComplete={mockOnComplete} />);
    expect(getByTestId('slide-1')).toBeTruthy();
    expect(getByTestId('slide-2')).toBeTruthy();
    expect(getByTestId('slide-3')).toBeTruthy();
  });
});
