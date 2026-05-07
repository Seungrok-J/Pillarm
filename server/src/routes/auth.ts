import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const router = Router();

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

// ── POST /auth/signup ────────────────────────────────────────────────────────

router.post('/signup', async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already in use', 409);

    const passwordHash = await bcrypt.hash(password, 10);
    const { fcmToken } = parsed.data as { fcmToken?: string };
    const user = await prisma.user.create({
      data: { email, passwordHash, name, ...(fcmToken ? { fcmToken } : {}) },
    });

    const payload = { userId: user.id, email: user.email };
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    const payload = { userId: user.id, email: user.email };
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

    const newAccess = signAccess({ userId: payload.userId, email: payload.email });
    const newRefresh = signRefresh({ userId: payload.userId, email: payload.email });

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

// ── POST /auth/reset-password ─────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  email:       z.string().email(),
  name:        z.string().trim().min(1),
  newPassword: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid input', 400);

    const { email, name, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    // 이메일·이름 불일치 시 동일한 오류 반환 (계정 존재 여부 노출 방지)
    if (!user || user.name?.trim().toLowerCase() !== name.trim().toLowerCase()) {
      throw new AppError('이름 또는 이메일이 일치하지 않습니다', 404);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // 기존 리프레시 토큰 전체 무효화 (보안)
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.json({ message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' });
  } catch (err) {
    next(err);
  }
});

export default router;
