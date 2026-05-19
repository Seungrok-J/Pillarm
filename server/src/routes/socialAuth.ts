import { Router } from 'express';
import https from 'https';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const SERVER_URL = process.env.SERVER_URL ?? 'https://pillarm-production.up.railway.app';

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

// ── HTTP GET (인증 헤더 없음) ──────────────────────────────────────────────────
function fetchGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
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

async function verifyNaver(accessToken: string): Promise<{ providerId: string; email?: string; name?: string }> {
  const data = await fetchJson<{ response?: { id?: string; email?: string; name?: string; nickname?: string } }>(
    'https://openapi.naver.com/v1/nid/me',
    accessToken,
  );
  if (!data.response?.id) throw new AppError('Invalid Naver token', 401);
  return {
    providerId: data.response.id,
    email: data.response.email,
    name: data.response.name ?? data.response.nickname,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user = await prisma.user.update({ where: { id: emailUser.id }, data: { provider, providerId, ...(fcmToken ? { fcmToken } : {}) } as any });
    }
  }

  const isNewUser = !user;
  if (!user) {
    const displayName = name ?? (email ? email.split('@')[0] : null) ?? provider;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user = await prisma.user.create({ data: { email: email ?? null, name: displayName, provider, providerId, ...(fcmToken ? { fcmToken } : {}) } as any });
  } else {
    // 기존 유저: 이름이 provider 폴백값("kakao","naver" 등)이면 실제 닉네임으로 업데이트
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

// ── POST /auth/social  (Apple / Google / Kakao / Naver accessToken 방식) ──────

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
      case 'naver': {
        if (!accessToken) throw new AppError('accessToken required for Naver', 400);
        ({ providerId, email, name: providerName } = await verifyNaver(accessToken));
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

// ── GET /auth/social/naver/start  (서버사이드 OAuth 시작) ─────────────────────

router.get('/naver/start', (req, res) => {
  const clientId   = process.env.NAVER_CLIENT_ID ?? '';
  const callbackUri = `${SERVER_URL}/auth/social/naver/callback`;
  const state      = Math.random().toString(36).substring(7);
  res.redirect(
    `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUri)}&state=${state}`,
  );
});

// ── GET /auth/social/naver/callback  (Naver → 서버 → 앱 딥링크) ──────────────

router.get('/naver/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) return res.redirect('pillarm://oauth-callback?error=no_code');

    const clientId    = process.env.NAVER_CLIENT_ID ?? '';
    const clientSecret = process.env.NAVER_CLIENT_SECRET ?? '';
    const callbackUri  = `${SERVER_URL}/auth/social/naver/callback`;

    // 1. 인가 코드 → 액세스 토큰
    const tokenData = await fetchGet<{ access_token?: string }>(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}&redirect_uri=${encodeURIComponent(callbackUri)}`,
    );
    if (!tokenData.access_token) return res.redirect('pillarm://oauth-callback?error=no_token');

    // 2. 사용자 정보 조회
    const { providerId, email, name } = await verifyNaver(tokenData.access_token);

    // 3. DB upsert + JWT 발급
    const { user, isNewUser, accessToken, refreshToken } = await upsertSocialUser({
      provider: 'naver', providerId, email, name,
    });

    // 4. 앱 딥링크로 HTTP 302 → ASWebAuthenticationSession이 pillarm:// 감지
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      userId:    user.id,
      name:      user.name ?? '',
      isNewUser: String(isNewUser),
    });
    return res.redirect(`pillarm://oauth-callback?${params.toString()}`);
  } catch (err) {
    return next(err);
  }
});

export default router;
