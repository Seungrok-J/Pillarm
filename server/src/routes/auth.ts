import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
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

    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already in use', 409);

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiry() },
    });

    res.status(201).json({ accessToken, refreshToken, userId: user.id });
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
    if (!user) throw new AppError('Invalid credentials', 401);

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

    res.json({ accessToken, refreshToken, userId: user.id });
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

export default router;
