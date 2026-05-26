import { Router } from 'express';
import https from 'https';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const PROVIDER_NAMES: Record<string, string> = {
  google: '구글',
  kakao:  '카카오',
  apple:  '애플',
};

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

const socialSchema = z.object({
  provider:    z.enum(['apple', 'google', 'kakao']),
  idToken:     z.string().optional(),
  accessToken: z.string().optional(),
  name:        z.string().trim().max(50).optional(),
  fcmToken:    z.string().optional(),
});

// ── HTTP GET (Bearer 인증) ────────────────────────────────────────────────────
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

// ── 제공자별 토큰 검증 ─────────────────────────────────────────────────────────

async function verifyApple(idToken: string): Promise<{ providerId: string; email?: string; name?: string }> {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  });
  return { providerId: payload.sub, email: payload.email };
}

async function verifyGoogle(idToken: string): Promise<{ providerId: string; email: string; name?: string }> {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new AppError('Invalid Google token', 401);
  return { providerId: payload.sub, email: payload.email!, name: payload.name };
}

async function verifyKakao(accessToken: string): Promise<{ providerId: string; email?: string; name?: string }> {
  const data = await fetchJson<{
    id: number;
    kakao_account?: { email?: string; profile?: { nickname?: string } };
    properties?: { nickname?: string };
  }>(
    'https://kapi.kakao.com/v2/user/me',
    accessToken,
  );
  if (!data.id) throw new AppError('Invalid Kakao token', 401);
  return {
    providerId: String(data.id),
    email: data.kakao_account?.email,
    name: data.kakao_account?.profile?.nickname ?? data.properties?.nickname,
  };
}

// ── 공통: 소셜 사용자 DB upsert + JWT 발급 ───────────────────────────────────

async function upsertSocialUser(params: {
  provider: string;
  providerId: string;
  email?: string;
  name?: string;
  fcmToken?: string;
}) {
  const { provider, providerId, email, name, fcmToken } = params;

  let user = await prisma.user.findFirst({ where: { provider, providerId } });

  if (!user && email) {
    const emailUser = await prisma.user.findUnique({ where: { email } });
    if (emailUser) {
      if (!emailUser.provider) {
        // 이메일/비밀번호 계정 — 침묵 연결 금지
        throw new AppError(
          '이 이메일은 이미 이메일/비밀번호로 가입된 계정입니다. 이메일 로그인을 이용해주세요.',
          409,
        );
      }
      if (emailUser.provider !== provider) {
        // 다른 소셜 제공자 계정
        const existingName = PROVIDER_NAMES[emailUser.provider] ?? emailUser.provider;
        throw new AppError(
          `이 이메일은 이미 ${existingName} 계정으로 가입되어 있습니다. ${existingName} 로그인을 이용해주세요.`,
          409,
        );
      }
      // 같은 제공자·같은 이메일 → 기존 계정 사용 (providerId 업데이트)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user = await prisma.user.update({ where: { id: emailUser.id }, data: { providerId, ...(fcmToken ? { fcmToken } : {}) } as any });
    }
  }

  const isNewUser = !user;
  if (!user) {
    const displayName = name ?? (email ? email.split('@')[0] : null) ?? provider;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user = await prisma.user.create({ data: { email: email ?? null, name: displayName, provider, providerId, ...(fcmToken ? { fcmToken } : {}) } as any });
  } else {
    // 기존 유저: 이름이 provider 폴백값("kakao" 등)이면 실제 닉네임으로 업데이트
    const needsNameUpdate = name && user.name === provider;
    const updateData = {
      ...(needsNameUpdate ? { name } : {}),
      ...(fcmToken ? { fcmToken } : {}),
    };
    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updateData });
    }
  }

  const jwtPayload = { userId: user.id, email: user.email ?? '' };
  const accessToken  = signAccess(jwtPayload);
  const refreshToken = signRefresh(jwtPayload);
  await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiry() } });

  return { user, isNewUser, accessToken, refreshToken };
}

// ── POST /auth/social  (Apple / Google / Kakao) ──────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const parsed = socialSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const { provider, idToken, accessToken, name: clientName, fcmToken } = parsed.data;

    let providerId: string;
    let email: string | undefined;
    let providerName: string | undefined;

    switch (provider) {
      case 'apple': {
        if (!idToken) throw new AppError('idToken required for Apple', 400);
        ({ providerId, email } = await verifyApple(idToken));
        providerName = clientName; // Apple은 클라이언트에서 이름 전달
        break;
      }
      case 'google': {
        if (!idToken) throw new AppError('idToken required for Google', 400);
        ({ providerId, email, name: providerName } = await verifyGoogle(idToken));
        break;
      }
      case 'kakao': {
        if (!accessToken) throw new AppError('accessToken required for Kakao', 400);
        ({ providerId, email, name: providerName } = await verifyKakao(accessToken));
        break;
      }
    }

    const { user, isNewUser, accessToken: newAccess, refreshToken: newRefresh } = await upsertSocialUser({
      provider, providerId: providerId!, email, name: clientName ?? providerName, fcmToken,
    });

    res.status(isNewUser ? 201 : 200).json({
      accessToken:  newAccess,
      refreshToken: newRefresh,
      userId:       user.id,
      name:         user.name,
      isNewUser,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
