/**
 * 소셜 로그인 / 계정 연결 확인 API 테스트
 *
 * AC1 — socialLogin: requiresLink 응답을 그대로 반환한다
 * AC2 — confirmSocialLink: linkToken 을 body 에 담아 POST
 */

jest.mock('../../../src/features/careCircle/careCircleApi', () => ({
  api: {
    post:   jest.fn(),
    get:    jest.fn(),
    delete: jest.fn(),
  },
}));

import { api } from '../../../src/features/careCircle/careCircleApi';
import {
  socialLogin,
  confirmSocialLink,
} from '../../../src/features/socialAuth/socialAuthApi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPost = (api as any).post as jest.Mock;

const AUTH_RESPONSE = {
  accessToken: 'acc', refreshToken: 'ref', userId: 'u1', isNewUser: false,
};
const LINK_REQUIRED = {
  requiresLink: true, existingProvider: '구글', newProvider: '카카오',
  email: 'a@b.com', linkToken: 'tok123',
};

beforeEach(() => jest.clearAllMocks());

describe('AC1 — socialLogin requiresLink 응답', () => {
  it('서버가 requiresLink 를 반환하면 그대로 반환한다', async () => {
    mockPost.mockResolvedValue({ data: LINK_REQUIRED });
    const result = await socialLogin({ provider: 'kakao', accessToken: 'kak-tok' });
    expect(result).toEqual(LINK_REQUIRED);
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/social',
      expect.objectContaining({ provider: 'kakao' }),
    );
  });

  it('서버가 정상 응답하면 SocialAuthResponse 를 반환한다', async () => {
    mockPost.mockResolvedValue({ data: AUTH_RESPONSE });
    const result = await socialLogin({ provider: 'google', idToken: 'id-tok' });
    expect(result).toEqual(AUTH_RESPONSE);
  });
});

describe('AC2 — confirmSocialLink', () => {
  it('linkToken 을 body 에 담아 POST /auth/social/confirm-link 를 호출한다', async () => {
    mockPost.mockResolvedValue({ data: AUTH_RESPONSE });
    const result = await confirmSocialLink('tok123');

    expect(mockPost).toHaveBeenCalledWith(
      '/auth/social/confirm-link',
      { linkToken: 'tok123' },
    );
    expect(result).toEqual(AUTH_RESPONSE);
  });
});
