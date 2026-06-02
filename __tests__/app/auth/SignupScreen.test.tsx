/**
 * SignupScreen 테스트 (이메일 로그인 전용 — 기존 계정 보유자용)
 *
 * AC1 — 이메일/비밀번호 미입력 시 버튼 비활성화
 * AC2 — 로그인 성공 → 세션 저장 → goBack
 * AC3 — 로그인 실패 → Alert 표시
 * AC4 — 비밀번호 찾기 버튼 → ForgotPassword 이동
 * AC5 — 소셜 로그인으로 돌아가기 → goBack
 */

const mockGoBack   = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

jest.mock('../../../src/features/careCircle/careCircleApi', () => ({
  authLogin: jest.fn(),
}));

jest.mock('../../../src/notifications/pushToken', () => ({
  getExpoPushToken: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../src/sync/syncService', () => ({
  pullFromServer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/db', () => ({
  getUserSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/notifications', () => ({
  rescheduleAllSchedules: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/store/authStore', () => ({
  useAuthStore: () => ({ saveSession: mockSaveSession }),
}));

const mockSaveSession = jest.fn().mockResolvedValue(undefined);

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { authLogin } from '../../../src/features/careCircle/careCircleApi';
import SignupScreen from '../../../src/app/auth/SignupScreen';

const mockAuthLogin = authLogin as jest.Mock;

const AUTH_RESPONSE = {
  accessToken: 'acc', refreshToken: 'ref',
  userId: 'u1', name: '홍길동',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveSession.mockResolvedValue(undefined);
});

describe('SignupScreen (이메일 로그인)', () => {
  describe('AC1 — 버튼 비활성화', () => {
    it('초기 상태에서 로그인 버튼이 비활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(true);
    });

    it('이메일만 입력하면 비활성화 유지', () => {
      const { getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-email'), 'test@example.com');
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(true);
    });

    it('이메일+비밀번호 모두 입력하면 활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(false);
    });
  });

  describe('AC2 — 로그인 성공', () => {
    it('authLogin 호출 후 세션 저장 → goBack', async () => {
      mockAuthLogin.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(mockAuthLogin).toHaveBeenCalledWith(
          'test@example.com', 'password123', undefined,
        );
        expect(mockSaveSession).toHaveBeenCalledWith(
          expect.objectContaining({ accessToken: 'acc', userId: 'u1' }),
        );
        expect(mockGoBack).toHaveBeenCalledTimes(1);
      });
    });

    it('이메일을 소문자로 정규화하여 전달한다', async () => {
      mockAuthLogin.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'Test@Example.COM');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(mockAuthLogin).toHaveBeenCalledWith('test@example.com', 'password123', undefined);
      });
    });
  });

  describe('AC3 — 로그인 실패', () => {
    it('서버 에러 메시지를 Alert 으로 표시한다', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockAuthLogin.mockRejectedValue({
        response: { data: { error: '이메일 또는 비밀번호가 올바르지 않습니다' } },
      });

      const { getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'wrongpass');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          '로그인 실패', '이메일 또는 비밀번호가 올바르지 않습니다',
        );
      });
    });
  });

  describe('AC4 — 비밀번호 찾기', () => {
    it('비밀번호를 잊으셨나요? → ForgotPassword 이동', () => {
      const { getByText } = render(<SignupScreen />);
      fireEvent.press(getByText('비밀번호를 잊으셨나요?'));
      expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
    });
  });

  describe('AC5 — 소셜 로그인으로 돌아가기', () => {
    it('소셜 로그인으로 돌아가기 → goBack', () => {
      const { getByText } = render(<SignupScreen />);
      fireEvent.press(getByText('소셜 로그인으로 돌아가기'));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });
});
