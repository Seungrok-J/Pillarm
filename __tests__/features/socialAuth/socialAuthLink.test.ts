/**
 * 소셜 계정 연결/해제 API 테스트
 *
 * AC1 — socialLogin: requiresLink 응답을 그대로 반환한다
 * AC2 — confirmSocialLink: linkToken 을 body 에 담아 POST
 * AC3 — getSocialConnections: GET /auth/social/connections 호출
 * AC4 — linkSocialAccount: POST /auth/social/link 호출
 * AC5 — unlinkSocialAccount: DELETE /auth/social/link/:provider 호출
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
  getSocialConnections,
  linkSocialAccount,
  unlinkSocialAccount,
} from '../../../src/features/socialAuth/socialAuthApi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPost   = (api as any).post   as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGet    = (api as any).get    as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDelete = (api as any).delete as jest.Mock;

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

describe('AC3 — getSocialConnections', () => {
  it('GET /auth/social/connections 를 호출하고 결과를 반환한다', async () => {
    const serverData = {
      connections: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
      hasPassword: false,
    };
    mockGet.mockResolvedValue({ data: serverData });

    const result = await getSocialConnections();

    expect(mockGet).toHaveBeenCalledWith('/auth/social/connections');
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]?.provider).toBe('google');
    expect(result.hasPassword).toBe(false);
  });
});

describe('AC4 — linkSocialAccount', () => {
  it('POST /auth/social/link 를 올바른 payload 로 호출한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    await linkSocialAccount({ provider: 'kakao', accessToken: 'kak-tok' });

    expect(mockPost).toHaveBeenCalledWith(
      '/auth/social/link',
      expect.objectContaining({ provider: 'kakao', accessToken: 'kak-tok' }),
    );
  });
});

describe('AC5 — unlinkSocialAccount', () => {
  it('DELETE /auth/social/link/google 를 호출한다', async () => {
    mockDelete.mockResolvedValue({ data: {} });
    await unlinkSocialAccount('google');
    expect(mockDelete).toHaveBeenCalledWith('/auth/social/link/google');
  });

  it('DELETE /auth/social/link/kakao 를 호출한다', async () => {
    mockDelete.mockResolvedValue({ data: {} });
    await unlinkSocialAccount('kakao');
    expect(mockDelete).toHaveBeenCalledWith('/auth/social/link/kakao');
  });
});
