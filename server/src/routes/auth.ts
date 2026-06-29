import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const router = Router();

const PROVIDER_NAMES: Record<string, string> = {
  google: '구글',
  kakao:  '카카오',
  apple:  '애플',
};

const signupSchema = z.object({
  email:    z.string().email('유효한 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
  name:     z.string().trim().min(1).max(50).optional(),
  fcmToken: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

// ── POST /auth/signup — 이메일 가입 비활성화 (소셜 로그인 전용) ────────────────

router.post('/signup', async (_req, res) => {
  res.status(410).json({
    error: '이메일 가입은 더 이상 지원되지 않습니다. 소셜 로그인(Apple·Google·카카오)을 이용해주세요.',
  });
});

router.post('/signup-disabled', async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
      include: { socialConnections: true },
    });

    if (existing) {
      // 소셜 연결 감지 (User.provider 레거시 + SocialConnection 신규 테이블)
      const linkedProviders = [
        ...(existing.provider ? [existing.provider] : []),
        ...existing.socialConnections.map((c) => c.provider),
      ];

      if (linkedProviders.length > 0) {
        const primaryProvider = existing.provider ?? existing.socialConnections[0]?.provider ?? '';
        const pName = PROVIDER_NAMES[primaryProvider] ?? primaryProvider;
        // existingProvider 를 포함해 클라이언트가 적절한 버튼을 강조할 수 있도록
        return res.status(409).json({
          error: `이 이메일은 이미 ${pName} 계정으로 가입되어 있습니다. ${pName} 로그인을 이용해주세요.`,
          existingProvider: primaryProvider,
        });
      }

      return res.status(409).json({ error: '이미 가입된 이메일입니다. 로그인을 이용해주세요.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { fcmToken } = parsed.data as { fcmToken?: string };
    const user = await prisma.user.create({
      data: { email, passwordHash, name, ...(fcmToken ? { fcmToken } : {}) },
    });

    const payload = { userId: user.id, email: user.email ?? '' };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiry() },
    });

    res.status(201).json({ accessToken, refreshToken, userId: user.id, name: user.name });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid input', 400);

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { socialConnections: true },
    });
    if (!user) throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);

    if (!user.passwordHash) {
      const primaryProvider = user.provider ?? user.socialConnections[0]?.provider;
      if (primaryProvider) {
        const pName = PROVIDER_NAMES[primaryProvider] ?? primaryProvider;
        throw new AppError(
          `이 이메일은 ${pName} 계정으로 가입되어 있습니다. ${pName} 로그인을 이용해주세요.`,
          401,
        );
      }
      throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);

    const payload = { userId: user.id, email: user.email ?? '' };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiry() },
    });

    // Persist FCM token if provided
    const { fcmToken } = req.body as { fcmToken?: string };
    if (fcmToken) {
      await prisma.user.update({ where: { id: user.id }, data: { fcmToken } });
    }

    res.json({ accessToken, refreshToken, userId: user.id, name: user.name });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ───────────────────────────────────────────────────────

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw new AppError('refreshToken required', 400);

    // Verify JWT signature first (cheap)
    let payload;
    try {
      payload = verifyRefresh(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Confirm token exists in DB (rotation check)
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Rotate: delete old, issue new
    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    // isAdmin은 DB에서 최신 값으로 읽는다
    const freshUser = await prisma.user.findUnique({ where: { id: stored.userId }, select: { isAdmin: true } });
    const tokenPayload = { userId: payload.userId, email: payload.email, isAdmin: freshUser?.isAdmin ?? false };
    const newAccess  = signAccess(tokenPayload);
    const newRefresh = signRefresh(tokenPayload);

    await prisma.refreshToken.create({
      data: { userId: stored.userId, token: newRefresh, expiresAt: refreshExpiry() },
    });

    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, provider: true, createdAt: true },
    });
    if (!user) throw new AppError('User not found', 404);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /auth/me ────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: parsed.data.name },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /auth/fcm-token ─────────────────────────────────────────────────────
// 앱 시작 시 이미 로그인된 사용자의 FCM 토큰 갱신

router.patch('/fcm-token', requireAuth, async (req, res, next) => {
  try {
    const { fcmToken } = req.body as { fcmToken?: string };
    if (!fcmToken?.trim()) throw new AppError('fcmToken required', 400);

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { fcmToken: fcmToken.trim() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /auth/me ───────────────────────────────────────────────────────────

router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.user!;

    // 다른 케어서클에서 이 사용자의 멤버십 삭제
    await prisma.careMember.deleteMany({ where: { memberUserId: userId } });
    // 다른 케어서클에서 이 사용자가 환자인 스냅샷 삭제
    await prisma.doseEventSnapshot.deleteMany({ where: { patientId: userId } });
    // 소유한 케어서클 삭제 (멤버·정책·초대코드·스냅샷 cascade)
    await prisma.careCircle.deleteMany({ where: { ownerUserId: userId } });
    // 유저 삭제 (리프레시토큰·약·일정·복용기록 cascade)
    await prisma.user.delete({ where: { id: userId } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/reset-password — 비활성화 (소셜 로그인 전용) ─────────────────────
// 이메일+이름만으로 비밀번호를 재설정하면 계정 탈취가 가능하므로 비활성화.
// 이메일 전송 인프라 도입 후 OTP 기반으로 재구현 예정.

router.post('/reset-password', async (_req, res) => {
  res.status(410).json({
    error: '비밀번호 재설정은 현재 지원하지 않습니다. Apple·Google·카카오 소셜 로그인을 이용해주세요.',
  });
});

export default router;
