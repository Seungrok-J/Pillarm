/**
 * LoginScreen 테스트 (소셜 로그인 전용)
 *
 * AC1 — 소셜 버튼 3개(Apple은 iOS 한정)가 렌더된다
 * AC2 — Google 로그인 성공 → 세션 저장 → goBack
 * AC3 — 카카오 로그인 성공 → 세션 저장
 * AC4 — 소셜 로그인 취소(cancelled) → Alert 없음
 * AC5 — requiresLink 응답 → 연결 Alert 표시
 * AC6 — 연결하기 확인 → confirmSocialLink 호출
 * AC7 — 이메일로 로그인 링크 → Signup 화면 이동
 */

const mockGoBack   = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

jest.mock('../../../src/store/authStore', () => ({
  useAuthStore: () => ({ saveSession: mockSaveSession }),
}));

const mockSaveSession = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/sync/syncService', () => ({
  initialPush:    jest.fn().mockResolvedValue(undefined),
  pullFromServer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/db', () => ({
  getUserSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/notifications', () => ({
  rescheduleAllSchedules: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/features/socialAuth', () => ({
  isAppleAuthAvailable: jest.fn().mockReturnValue(false),
  signInWithApple:  jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithKakao:  jest.fn(),
}));

jest.mock('../../../src/features/socialAuth/socialAuthApi', () => ({
  confirmSocialLink: jest.fn(),
}));

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { signInWithGoogle, signInWithKakao } from '../../../src/features/socialAuth';
import { confirmSocialLink } from '../../../src/features/socialAuth/socialAuthApi';
import LoginScreen from '../../../src/app/auth/LoginScreen';

const mockGoogleLogin = signInWithGoogle as jest.Mock;
const mockKakaoLogin  = signInWithKakao  as jest.Mock;
const mockConfirmLink = confirmSocialLink as jest.Mock;

const AUTH_RESPONSE = {
  accessToken: 'acc', refreshToken: 'ref',
  userId: 'u1', name: '홍길동', isNewUser: false,
};
const LINK_REQUIRED = {
  requiresLink: true, existingProvider: '구글', newProvider: '카카오',
  email: 'a@b.com', linkToken: 'tok',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveSession.mockResolvedValue(undefined);
});

describe('LoginScreen', () => {
  describe('AC1 — 소셜 버튼 렌더', () => {
    it('Google 버튼이 렌더된다', () => {
      const { getByTestId } = render(<LoginScreen />);
      expect(getByTestId('btn-google')).toBeTruthy();
    });

    it('카카오 버튼이 렌더된다', () => {
      const { getByTestId } = render(<LoginScreen />);
      expect(getByTestId('btn-kakao')).toBeTruthy();
    });

    it('이메일로 로그인 링크가 렌더된다', () => {
      const { getByTestId } = render(<LoginScreen />);
      expect(getByTestId('btn-go-signup')).toBeTruthy();
    });
  });

  describe('AC2 — Google 로그인 성공', () => {
    it('saveSession 호출 후 goBack 한다', async () => {
      mockGoogleLogin.mockResolvedValue(AUTH_RESPONSE);

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-google'));

      await waitFor(() => {
        expect(mockSaveSession).toHaveBeenCalledWith(
          expect.objectContaining({ accessToken: 'acc', userId: 'u1' }),
        );
        expect(mockGoBack).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('AC3 — 카카오 로그인 성공', () => {
    it('saveSession 이 호출된다', async () => {
      mockKakaoLogin.mockResolvedValue({ ...AUTH_RESPONSE, name: '김철수' });

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-kakao'));

      await waitFor(() => {
        expect(mockSaveSession).toHaveBeenCalled();
      });
    });
  });

  describe('AC4 — 로그인 취소', () => {
    it('SIGN_IN_CANCELLED 에러 → Alert 없음', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockGoogleLogin.mockRejectedValue(
        Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }),
      );

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-google'));

      await waitFor(() => { expect(mockGoogleLogin).toHaveBeenCalled(); });
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('AC5 — requiresLink Alert', () => {
    it('requiresLink 응답 시 연결 Alert 가 뜬다', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockKakaoLogin.mockResolvedValue(LINK_REQUIRED);

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-kakao'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          '이미 가입된 이메일',
          expect.stringContaining('a@b.com'),
          expect.arrayContaining([
            expect.objectContaining({ text: '취소' }),
            expect.objectContaining({ text: '연결하기' }),
          ]),
        );
      });
    });
  });

  describe('AC6 — 연결하기 확인', () => {
    it('연결하기 탭 → confirmSocialLink 호출', async () => {
      mockKakaoLogin.mockResolvedValue(LINK_REQUIRED);
      mockConfirmLink.mockResolvedValue(AUTH_RESPONSE);

      let confirmCb: (() => void) | undefined;
      jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons) => {
        confirmCb = (buttons as any[])?.find((b: any) => b.text === '연결하기')?.onPress;
      });

      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-kakao'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await confirmCb?.();

      await waitFor(() => {
        expect(mockConfirmLink).toHaveBeenCalledWith('tok');
        expect(mockSaveSession).toHaveBeenCalled();
      });
    });
  });

  describe('AC7 — 이메일로 로그인 링크', () => {
    it('이메일로 로그인 버튼 탭 → Signup 화면 이동', () => {
      const { getByTestId } = render(<LoginScreen />);
      fireEvent.press(getByTestId('btn-go-signup'));
      expect(mockNavigate).toHaveBeenCalledWith('Signup');
    });
  });
});
