import { Router } from 'express';
import https from 'https';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

const socialSchema = z.object({
  provider:    z.enum(['apple', 'google', 'kakao', 'naver']),
  idToken:     z.string().optional(),
  accessToken: z.string().optional(),
  name:        z.string().trim().max(50).optional(),
  fcmToken:    z.string().optional(),
});

// ── 제공자별 토큰 검증 → { providerId, email } ─────────────────────────────────

async function verifyApple(idToken: string): Promise<{ providerId: string; email?: string }> {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  });
  return { providerId: payload.sub, email: payload.email };
}

async function verifyGoogle(idToken: string): Promise<{ providerId: string; email: string }> {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new AppError('Invalid Google token', 401);
  return { providerId: payload.sub, email: payload.email! };
}

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

async function verifyKakao(accessToken: string): Promise<{ providerId: string; email?: string }> {
  const data = await fetchJson<{ id: number; kakao_account?: { email?: string } }>(
    'https://kapi.kakao.com/v2/user/me',
    accessToken,
  );
  if (!data.id) throw new AppError('Invalid Kakao token', 401);
  return { providerId: String(data.id), email: data.kakao_account?.email };
}

async function verifyNaver(accessToken: string): Promise<{ providerId: string; email?: string }> {
  const data = await fetchJson<{ response?: { id?: string; email?: string } }>(
    'https://openapi.naver.com/v1/nid/me',
    accessToken,
  );
  if (!data.response?.id) throw new AppError('Invalid Naver token', 401);
  return { providerId: data.response.id, email: data.response.email };
}

// ── POST /auth/social ──────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const parsed = socialSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const { provider, idToken, accessToken, name, fcmToken } = parsed.data;

    // 1. 제공자 토큰 검증
    let providerId: string;
    let email: string | undefined;

    switch (provider) {
      case 'apple': {
        if (!idToken) throw new AppError('idToken required for Apple', 400);
        ({ providerId, email } = await verifyApple(idToken));
        break;
      }
      case 'google': {
        if (!idToken) throw new AppError('idToken required for Google', 400);
        ({ providerId, email } = await verifyGoogle(idToken));
        break;
      }
      case 'kakao': {
        if (!accessToken) throw new AppError('accessToken required for Kakao', 400);
        ({ providerId, email } = await verifyKakao(accessToken));
        break;
      }
      case 'naver': {
        if (!accessToken) throw new AppError('accessToken required for Naver', 400);
        ({ providerId, email } = await verifyNaver(accessToken));
        break;
      }
    }

    // 2. 기존 소셜 계정 조회
    let user = await prisma.user.findFirst({
      where: { provider, providerId },
    });

    // 3. 동일 이메일의 이메일 계정이 있으면 소셜 연결
    if (!user && email) {
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser) {
        user = await prisma.user.update({
          where: { id: emailUser.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { provider, providerId, ...(fcmToken ? { fcmToken } : {}) } as any,
        });
      }
    }

    // 4. 없으면 신규 생성
    const isNewUser = !user;
    if (!user) {
      const displayName = name ?? (email ? email.split('@')[0] : null) ?? provider;
      user = await prisma.user.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          email: email ?? null,
          name: displayName,
          provider,
          providerId,
          ...(fcmToken ? { fcmToken } : {}),
        } as any,
      });
    } else if (fcmToken) {
      await prisma.user.update({ where: { id: user.id }, data: { fcmToken } });
    }

    // 5. 토큰 발급
    const jwtPayload = { userId: user.id, email: user.email ?? '' };
    const newAccess   = signAccess(jwtPayload);
    const newRefresh  = signRefresh(jwtPayload);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: newRefresh, expiresAt: refreshExpiry() },
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
