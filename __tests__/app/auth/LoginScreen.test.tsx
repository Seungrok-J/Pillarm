/**
 * LoginScreen 테스트
 *
 * AC1 — 이메일·비밀번호 미입력 시 로그인 버튼 비활성화
 * AC2 — authLogin 호출 → 세션 저장 → goBack 호출
 * AC3 — authLogin 실패 시 Alert 표시
 * AC4 — 비밀번호 찾기 버튼 → ForgotPassword 화면 이동
 * AC5 — 회원가입 버튼 → Signup 화면 이동
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
  initialPush:    jest.fn().mockResolvedValue(undefined),
  pullFromServer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/store/authStore', () => ({
  useAuthStore: () => ({ saveSession: mockSaveSession }),
}));

const mockSaveSession = jest.fn().mockResolvedValue(undefined);

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { authLogin } from '../../../src/features/careCircle/careCircleApi';
import LoginScreen from '../../../src/app/auth/LoginScreen';

const mockAuthLogin = authLogin as jest.Mock;

const AUTH_RESPONSE = {
  accessToken:  'access-tok',
  refreshToken: 'refresh-tok',
  userId:       'user-1',
  name:         '홍길동',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveSession.mockResolvedValue(undefined);
});

describe('LoginScreen', () => {
  describe('AC1 — 버튼 비활성화', () => {
    it('초기 상태에서 로그인 버튼이 비활성화되어 있다', () => {
      const { getByTestId } = render(<LoginScreen />);
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(true);
    });

    it('이메일만 입력하면 버튼이 비활성화 상태 유지', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'), 'test@example.com');
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(true);
    });

    it('비밀번호만 입력하면 버튼이 비활성화 상태 유지', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(true);
    });

    it('이메일·비밀번호 모두 입력하면 버튼 활성화', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      expect(getByTestId('btn-login').props.accessibilityState?.disabled).toBe(false);
    });
  });

  describe('AC2 — 로그인 성공', () => {
    it('authLogin 호출 후 세션 저장 → goBack', async () => {
      mockAuthLogin.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(mockAuthLogin).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          undefined,
        );
        expect(mockSaveSession).toHaveBeenCalledWith({
          accessToken:  AUTH_RESPONSE.accessToken,
          refreshToken: AUTH_RESPONSE.refreshToken,
          userId:       AUTH_RESPONSE.userId,
          userEmail:    'test@example.com',
          userName:     AUTH_RESPONSE.name,
        });
        expect(mockGoBack).toHaveBeenCalledTimes(1);
      });
    });

    it('이메일은 소문자로 정규화하여 전달한다', async () => {
      mockAuthLogin.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'Test@Example.COM');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(mockAuthLogin).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          undefined,
        );
      });
    });
  });

  describe('AC3 — 로그인 실패', () => {
    it('서버 에러 메시지를 Alert 으로 표시한다', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockAuthLogin.mockRejectedValue({
        response: { data: { error: '이메일 또는 비밀번호가 틀렸습니다' } },
      });

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'wrongpass');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          '로그인 실패',
          '이메일 또는 비밀번호가 틀렸습니다',
        );
      });
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('에러 응답에 메시지 없으면 기본 메시지 표시', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockAuthLogin.mockRejectedValue(new Error('Network Error'));

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.press(getByTestId('btn-login'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('로그인 실패', '로그인에 실패했습니다');
      });
    });
  });

  describe('AC4 — 비밀번호 찾기 이동', () => {
    it('비밀번호 찾기 버튼 탭 → ForgotPassword 화면으로 이동', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-forgot-password'));
      expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
    });
  });

  describe('AC5 — 회원가입 이동', () => {
    it('회원가입 버튼 탭 → Signup 화면으로 이동', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-go-signup'));
      expect(mockNavigate).toHaveBeenCalledWith('Signup');
    });
  });
});
