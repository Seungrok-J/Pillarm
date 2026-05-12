/**
 * SignupScreen 테스트
 *
 * AC1 — 필수 입력 미충족 시 가입 버튼 비활성화
 * AC2 — 비밀번호 < 8자 오류 힌트 표시
 * AC3 — 비밀번호 불일치 오류 힌트 표시
 * AC4 — authSignup 호출 → 세션 저장 → goBack 호출
 * AC5 — authSignup 실패 시 Alert 표시
 * AC6 — 로그인 화면 이동 버튼
 */

const mockGoBack   = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

jest.mock('../../../src/features/careCircle/careCircleApi', () => ({
  authSignup: jest.fn(),
}));

jest.mock('../../../src/notifications/pushToken', () => ({
  getExpoPushToken: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../src/sync/syncService', () => ({
  initialPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/store/authStore', () => ({
  useAuthStore: () => ({ saveSession: mockSaveSession }),
}));

const mockSaveSession = jest.fn().mockResolvedValue(undefined);

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { authSignup } from '../../../src/features/careCircle/careCircleApi';
import SignupScreen from '../../../src/app/auth/SignupScreen';

const mockAuthSignup = authSignup as jest.Mock;

const AUTH_RESPONSE = {
  accessToken:  'access-tok',
  refreshToken: 'refresh-tok',
  userId:       'user-1',
  name:         '홍길동',
};

function fillForm(
  getByTestId: ReturnType<typeof render>['getByTestId'],
  overrides: { name?: string; email?: string; password?: string; confirm?: string } = {},
) {
  const { name = '홍길동', email = 'test@example.com', password = 'password123', confirm = 'password123' } = overrides;
  if (name)     fireEvent.changeText(getByTestId('input-name'),     name);
  if (email)    fireEvent.changeText(getByTestId('input-email'),    email);
  if (password) fireEvent.changeText(getByTestId('input-password'), password);
  if (confirm)  fireEvent.changeText(getByTestId('input-confirm'),  confirm);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveSession.mockResolvedValue(undefined);
});

describe('SignupScreen', () => {
  describe('AC1 — 버튼 비활성화', () => {
    it('초기 상태에서 가입 버튼 비활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      expect(getByTestId('btn-signup').props.accessibilityState?.disabled).toBe(true);
    });

    it('이름 미입력 시 버튼 비활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId, { name: '' });
      fireEvent.changeText(getByTestId('input-email'),    'test@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.changeText(getByTestId('input-confirm'),  'password123');
      expect(getByTestId('btn-signup').props.accessibilityState?.disabled).toBe(true);
    });

    it('비밀번호 < 8자 시 버튼 비활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId, { password: 'short', confirm: 'short' });
      expect(getByTestId('btn-signup').props.accessibilityState?.disabled).toBe(true);
    });

    it('비밀번호 불일치 시 버튼 비활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId, { password: 'password123', confirm: 'different1' });
      expect(getByTestId('btn-signup').props.accessibilityState?.disabled).toBe(true);
    });

    it('모든 조건 충족 시 버튼 활성화', () => {
      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId);
      expect(getByTestId('btn-signup').props.accessibilityState?.disabled).toBe(false);
    });
  });

  describe('AC2 — 비밀번호 길이 힌트', () => {
    it('비밀번호 1~7자 입력 시 오류 힌트 표시', () => {
      const { getByText, getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-password'), 'abc');
      expect(getByText('비밀번호는 8자 이상이어야 합니다')).toBeTruthy();
    });

    it('비밀번호 미입력 시 힌트 미표시', () => {
      const { queryByText } = render(<SignupScreen />);
      expect(queryByText('비밀번호는 8자 이상이어야 합니다')).toBeNull();
    });
  });

  describe('AC3 — 비밀번호 불일치 힌트', () => {
    it('비밀번호와 확인 불일치 시 힌트 표시', () => {
      const { getByText, getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.changeText(getByTestId('input-confirm'),  'different!');
      expect(getByText('비밀번호가 일치하지 않습니다')).toBeTruthy();
    });

    it('비밀번호 일치 시 힌트 미표시', () => {
      const { queryByText, getByTestId } = render(<SignupScreen />);
      fireEvent.changeText(getByTestId('input-password'), 'password123');
      fireEvent.changeText(getByTestId('input-confirm'),  'password123');
      expect(queryByText('비밀번호가 일치하지 않습니다')).toBeNull();
    });
  });

  describe('AC4 — 회원가입 성공', () => {
    it('authSignup 호출 후 세션 저장 → goBack', async () => {
      mockAuthSignup.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId);
      fireEvent.press(getByTestId('btn-signup'));

      await waitFor(() => {
        expect(mockAuthSignup).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          '홍길동',
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
      mockAuthSignup.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId, { email: 'TEST@EXAMPLE.COM' });
      fireEvent.press(getByTestId('btn-signup'));

      await waitFor(() => {
        expect(mockAuthSignup).toHaveBeenCalledWith(
          'test@example.com',
          expect.any(String),
          expect.any(String),
          undefined,
        );
      });
    });
  });

  describe('AC5 — 회원가입 실패', () => {
    it('서버 에러 메시지를 Alert 으로 표시한다', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockAuthSignup.mockRejectedValue({
        response: { data: { error: '이미 사용 중인 이메일입니다' } },
      });

      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId);
      fireEvent.press(getByTestId('btn-signup'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          '회원가입 실패',
          '이미 사용 중인 이메일입니다',
        );
      });
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('에러 응답에 메시지 없으면 기본 메시지 표시', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockAuthSignup.mockRejectedValue(new Error('Network Error'));

      const { getByTestId } = render(<SignupScreen />);
      fillForm(getByTestId);
      fireEvent.press(getByTestId('btn-signup'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('회원가입 실패', '회원가입에 실패했습니다');
      });
    });
  });

  describe('AC6 — 로그인 화면 이동', () => {
    it('로그인 버튼 탭 → Login 화면으로 이동', () => {
      const { getByTestId } = render(<SignupScreen />);
      fireEvent.press(getByTestId('btn-go-login'));
      expect(mockNavigate).toHaveBeenCalledWith('Login');
    });
  });
});
