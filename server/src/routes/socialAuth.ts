import { Router } from 'express';
import https from 'https';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, signLinkToken, verifyLinkToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ── 상수 ─────────────────────────────────────────────────────────────────────

const PROVIDER_NAMES: Record<string, string> = {
  google: '구글',
  kakao:  '카카오',
  apple:  '애플',
};

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const refreshExpiry  = () => new Date(Date.now() + REFRESH_TTL_MS);

// ── 스키마 ────────────────────────────────────────────────────────────────────

const socialSchema = z.object({
  provider:    z.enum(['apple', 'google', 'kakao']),
  idToken:     z.string().optional(),
  accessToken: z.string().optional(),
  name:        z.string().trim().max(50).optional(),
  fcmToken:    z.string().optional(),
});

// ── 헬퍼: HTTP GET ────────────────────────────────────────────────────────────

function fetchJson<T>(url: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
  });
}

// ── 제공자별 토큰 검증 ────────────────────────────────────────────────────────

async function verifyApple(idToken: string) {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  });
  return { providerId: payload.sub, email: payload.email as string | undefined, name: undefined as string | undefined };
}

async function verifyGoogle(idToken: string) {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter(Boolean) as string[];
  if (!audiences.length) throw new AppError('Google client ID not configured', 500);
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: audiences });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new AppError('Invalid Google token', 401);
  return { providerId: payload.sub, email: payload.email!, name: payload.name };
}

async function verifyKakao(accessToken: string) {
  const data = await fetchJson<{
    id: number;
    kakao_account?: { email?: string; profile?: { nickname?: string } };
    properties?: { nickname?: string };
  }>('https://kapi.kakao.com/v2/user/me', accessToken);
  if (!data.id) throw new AppError('Invalid Kakao token', 401);
  return {
    providerId: String(data.id),
    email:  data.kakao_account?.email,
    name:   data.kakao_account?.profile?.nickname ?? data.properties?.nickname,
  };
}

async function verifySocial(
  provider: 'apple' | 'google' | 'kakao',
  idToken?: string,
  accessToken?: string,
) {
  switch (provider) {
    case 'apple':
      if (!idToken) throw new AppError('idToken required for Apple', 400);
      return verifyApple(idToken);
    case 'google':
      if (!idToken) throw new AppError('idToken required for Google', 400);
      return verifyGoogle(idToken);
    case 'kakao':
      if (!accessToken) throw new AppError('accessToken required for Kakao', 400);
      return verifyKakao(accessToken);
  }
}

// ── 헬퍼: JWT 발급 + 유저 반환 ────────────────────────────────────────────────

async function issueTokens(user: { id: string; email: string | null; name: string | null; isNewUser?: boolean; isAdmin?: boolean }) {
  // DB에서 최신 isAdmin 값을 읽는다 (user 객체가 stale할 수 있음)
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } });
  const isAdmin = fresh?.isAdmin ?? false;

  const payload = { userId: user.id, email: user.email ?? '', isAdmin };
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh(payload);
  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiry() },
  });
  return { accessToken, refreshToken, userId: user.id, name: user.name, isNewUser: user.isNewUser ?? false, isAdmin };
}

// ── 헬퍼: 유저 조회 (SocialConnection → User.provider/providerId → 없음) ─────

async function findUserBySocial(provider: string, providerId: string) {
  // 1. SocialConnection 테이블 조회 (신규 방식)
  const conn = await prisma.socialConnection.findUnique({
    where: { provider_providerId: { provider, providerId } },
    include: { user: true },
  });
  if (conn) return conn.user;

  // 2. User 테이블 직접 조회 (레거시 방식 — 기존 유저 호환)
  return prisma.user.findFirst({ where: { provider, providerId } });
}

// ── POST /auth/social  — 소셜 로그인 ─────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const parsed = socialSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const { provider, idToken, accessToken, name: clientName, fcmToken } = parsed.data;
    const verified = await verifySocial(provider, idToken, accessToken);
    const { providerId, email, name: providerName } = verified;
    const displayName = clientName ?? providerName;

    // 1. 기존 소셜 연결로 로그인
    let user = await findUserBySocial(provider, providerId);
    if (user) {
      if (fcmToken) await prisma.user.update({ where: { id: user.id }, data: { fcmToken } });
      const needsNameUpdate = displayName && user.name === provider;
      if (needsNameUpdate) await prisma.user.update({ where: { id: user.id }, data: { name: displayName } });
      return res.json(await issueTokens(user));
    }

    // 2. 동일 이메일 계정이 있는 경우 → 연결 확인 요청
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email },
        include: { socialConnections: true },
      });
      if (existing) {
        // 이미 같은 제공자로 연결되어 있으면 (다른 providerId) → 오류
        const sameProviderConn = existing.socialConnections.find((c) => c.provider === provider);
        const legacySameProvider = existing.provider === provider;
        if (sameProviderConn || legacySameProvider) {
          throw new AppError(`이 ${PROVIDER_NAMES[provider] ?? provider} 계정은 다른 필람 계정에 연결되어 있습니다.`, 409);
        }

        // 다른 제공자 → 연결 제안
        const existingProviderName = existing.provider
          ? (PROVIDER_NAMES[existing.provider] ?? existing.provider)
          : existing.socialConnections.length > 0
            ? (PROVIDER_NAMES[existing.socialConnections[0]!.provider] ?? existing.socialConnections[0]!.provider)
            : '이메일';

        const linkToken = signLinkToken({ provider, providerId, email, name: displayName });
        return res.status(200).json({
          requiresLink: true,
          existingProvider: existingProviderName,
          newProvider: PROVIDER_NAMES[provider] ?? provider,
          email,
          linkToken,
        });
      }
    }

    // 3. 신규 가입
    const newUser = await prisma.user.create({
      data: {
        email:    email ?? null,
        name:     displayName ?? (email ? email.split('@')[0] : provider),
        provider,
        providerId,
        fcmToken: fcmToken ?? null,
        socialConnections: {
          create: { provider, providerId },
        },
      },
    });

    return res.status(201).json(await issueTokens({ ...newUser, isNewUser: true }));
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/social/confirm-link  — 계정 연결 확인 ─────────────────────────

router.post('/confirm-link', async (req, res, next) => {
  try {
    const { linkToken } = z.object({ linkToken: z.string() }).parse(req.body);
    const { provider, providerId, email, name } = verifyLinkToken(linkToken);

    if (!email) throw new AppError('이메일 정보가 없어 연결할 수 없습니다', 400);

    const user = await prisma.user.findFirst({
      where: { email },
      include: { socialConnections: true },
    });
    if (!user) throw new AppError('연결할 계정을 찾을 수 없습니다', 404);

    // 이미 이 제공자로 연결된 경우
    const alreadyLinked =
      user.socialConnections.some((c) => c.provider === provider) ||
      user.provider === provider;
    if (alreadyLinked) throw new AppError(`이미 ${PROVIDER_NAMES[provider] ?? provider}이 연결되어 있습니다`, 409);

    // SocialConnection 생성
    await prisma.socialConnection.create({ data: { userId: user.id, provider, providerId } });

    // 이름이 provider 폴백값인 경우 실제 이름으로 업데이트
    if (name && user.name === user.provider) {
      await prisma.user.update({ where: { id: user.id }, data: { name } });
    }

    return res.json(await issueTokens(user));
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/social/connections  — 연결된 소셜 목록 ─────────────────────────

router.get('/connections', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;

    const [user, connections] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { provider: true, providerId: true, passwordHash: true } }),
      prisma.socialConnection.findMany({ where: { userId }, select: { provider: true, linkedAt: true } }),
    ]);

    const result: Array<{ provider: string; linkedAt: string }> = [...connections.map((c) => ({
      provider: c.provider,
      linkedAt: c.linkedAt.toISOString(),
    }))];

    // 레거시 User.provider도 포함 (SocialConnection에 없는 경우)
    if (user?.provider && !result.find((c) => c.provider === user.provider)) {
      result.push({ provider: user.provider, linkedAt: new Date(0).toISOString() });
    }

    res.json({ connections: result, hasPassword: !!user?.passwordHash });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/social/link  — 소셜 계정 추가 연결 (인증 필요) ────────────────

router.post('/link', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).userId as string;
    const parsed = socialSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const { provider, idToken, accessToken } = parsed.data;
    const { providerId } = await verifySocial(provider, idToken, accessToken);

    // 이미 다른 계정에 연결된 경우
    const existingConn = await prisma.socialConnection.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    const legacyUser = await prisma.user.findFirst({ where: { provider, providerId } });
    if (existingConn || legacyUser) {
      throw new AppError(`이 ${PROVIDER_NAMES[provider] ?? provider} 계정은 이미 다른 필람 계정에 연결되어 있습니다`, 409);
    }

    // 이미 이 유저에게 같은 제공자가 연결된 경우
    const alreadyLinked = await prisma.socialConnection.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (alreadyLinked) throw new AppError(`이미 ${PROVIDER_NAMES[provider] ?? provider}이 연결되어 있습니다`, 409);

    await prisma.socialConnection.create({ data: { userId, provider, providerId } });
    res.status(201).json({ message: `${PROVIDER_NAMES[provider] ?? provider} 계정이 연결되었습니다` });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /auth/social/link/:provider  — 소셜 연결 해제 (인증 필요) ─────────

router.delete('/link/:provider', requireAuth, async (req, res, next) => {
  try {
    const userId  = (req as any).userId as string;
    const provider = req.params['provider']!;

    const [user, connections] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, provider: true } }),
      prisma.socialConnection.findMany({ where: { userId } }),
    ]);

    const hasPassword     = !!user?.passwordHash;
    const hasLegacyProvider = user?.provider && user.provider !== provider;
    const otherConnections = connections.filter((c) => c.provider !== provider);

    // 마지막 로그인 수단이면 해제 불가
    if (!hasPassword && !hasLegacyProvider && otherConnections.length === 0) {
      throw new AppError('마지막 로그인 수단은 해제할 수 없습니다. 먼저 다른 계정을 연결하세요.', 400);
    }

    await prisma.socialConnection.deleteMany({ where: { userId, provider } });

    // 레거시 User.provider도 해제
    if (user?.provider === provider) {
      await prisma.user.update({ where: { id: userId }, data: { provider: null, providerId: null } });
    }

    res.json({ message: `${PROVIDER_NAMES[provider] ?? provider} 계정 연결이 해제되었습니다` });
  } catch (err) {
    next(err);
  }
});

export default router;
