import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';
import { sendPush } from '../services/fcmService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// 모든 /admin/* 엔드포인트는 관리자 인증 필수
router.use(requireAdmin);

// ── GET /admin/stats  — 유저 통계 ─────────────────────────────────────────────

router.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

    const [totalUsers, activeToday, newThisWeek] = await Promise.all([
      prisma.user.count(),

      // 오늘 RefreshToken을 새로 발급(= 로그인)한 고유 유저 수
      prisma.refreshToken
        .findMany({ where: { createdAt: { gte: todayStart } }, select: { userId: true }, distinct: ['userId'] })
        .then((rows) => rows.length),

      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    ]);

    res.json({ totalUsers, activeToday, newThisWeek });
  } catch (err) {
    next(err);
  }
});

// ── POST /admin/broadcast  — 전체 푸시 발송 ───────────────────────────────────

const broadcastSchema = z.object({
  title: z.string().min(1).max(60),
  body:  z.string().min(1).max(200),
});

router.post('/broadcast', async (req, res, next) => {
  try {
    const { title, body } = broadcastSchema.parse(req.body);

    // fcmToken이 있는 유저 전체 조회
    const users = await prisma.user.findMany({
      where:  { fcmToken: { not: null } },
      select: { id: true, fcmToken: true },
    });

    if (users.length === 0) {
      return res.json({ sent: 0, message: 'FCM 토큰을 가진 유저가 없습니다' });
    }

    // allSettled — 일부 실패해도 나머지 발송 계속
    const results = await Promise.allSettled(
      users.map((u) =>
        sendPush(u.fcmToken!, title, body, { type: 'admin_broadcast' }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed    = results.filter((r) => r.status === 'rejected').length;

    res.json({ sent: succeeded, failed, total: users.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/feature-flags  — 기능 플래그 목록 ─────────────────────────────

router.get('/feature-flags', async (_req, res, next) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
    res.json(flags);
  } catch (err) {
    next(err);
  }
});

// ── PUT /admin/feature-flags/:key  — 기능 플래그 on/off ───────────────────────

const flagUpdateSchema = z.object({
  enabled:     z.boolean(),
  description: z.string().max(200).optional(),
});

router.put('/feature-flags/:key', async (req, res, next) => {
  try {
    const key = req.params['key'];
    if (!key) throw new AppError('key is required', 400);

    const { enabled, description } = flagUpdateSchema.parse(req.body);

    const flag = await prisma.featureFlag.upsert({
      where:  { key },
      update: { enabled, ...(description !== undefined && { description }) },
      create: { key, enabled, description: description ?? '' },
    });

    res.json(flag);
  } catch (err) {
    next(err);
  }
});

export default router;
