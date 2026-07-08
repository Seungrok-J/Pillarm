import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

// ── GET /sync/pull ────────────────────────────────────────────────────────────
// 서버 저장 데이터를 앱으로 다운로드.
// ?since=ISO  → 해당 시점 이후 변경분만 (증분 동기화)
// since 없으면 전체 다운로드 (medications·schedules 전부, doseEvents 최근 90일)

router.get('/pull', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const since  = req.query.since as string | undefined;

    if (since && isNaN(Date.parse(since))) {
      throw new AppError('since must be a valid ISO timestamp', 400);
    }

    const [medications, schedules, doseEvents] = await Promise.all([
      prisma.medication.findMany({
        where: { userId, ...(since ? { updatedAt: { gt: since } } : {}) },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.schedule.findMany({
        where: { userId, ...(since ? { updatedAt: { gt: since } } : {}) },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.doseEvent.findMany({
        where: {
          userId,
          ...(since
            ? { updatedAt: { gt: since } }
            : { plannedAt: { gte: ninetyDaysAgo() } }),
        },
        orderBy: { plannedAt: 'desc' },
        take: since ? undefined : 500,
      }),
    ]);

    res.json({ medications, schedules, doseEvents });
  } catch (err) {
    next(err);
  }
});

// ── POST /sync/push ───────────────────────────────────────────────────────────
// 앱 로컬 데이터를 서버로 대량 업로드 (최초 로그인·기기 이전).
// Body: { medications[], schedules[], doseEvents[] }
// last-write-wins: 서버 updatedAt < 요청 updatedAt 이면 덮어씀.

router.post('/push', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const {
      medications = [],
      schedules   = [],
      doseEvents  = [],
    } = req.body as {
      medications?: Record<string, unknown>[];
      schedules?:   Record<string, unknown>[];
      doseEvents?:  Record<string, unknown>[];
    };

    // 소유권 검증 — 다른 사용자 소유의 id 로 upsert 하면 해당 레코드를
    // 덮어쓰면서 userId 까지 탈취할 수 있으므로(IDOR) 사전에 차단한다.
    const idsOf = (rows: Record<string, unknown>[]) =>
      rows.map((r) => r['id']).filter((v): v is string => typeof v === 'string');

    const [foreignMed, foreignSched, foreignEvt] = await Promise.all([
      medications.length
        ? prisma.medication.findFirst({
            where: { id: { in: idsOf(medications) }, userId: { not: userId } },
            select: { id: true },
          })
        : null,
      schedules.length
        ? prisma.schedule.findFirst({
            where: { id: { in: idsOf(schedules) }, userId: { not: userId } },
            select: { id: true },
          })
        : null,
      doseEvents.length
        ? prisma.doseEvent.findFirst({
            where: { id: { in: idsOf(doseEvents) }, userId: { not: userId } },
            select: { id: true },
          })
        : null,
    ]);
    if (foreignMed || foreignSched || foreignEvt) throw new AppError('Forbidden', 403);

    await Promise.all([
      ...medications.map((m) => {
        const { id, ...data } = m as any;
        return prisma.medication.upsert({
          where:  { id },
          update: { ...data, userId },
          create: { ...data, id, userId },
        });
      }),
      ...schedules.map((s) => {
        const { id, ...data } = s as any;
        return prisma.schedule.upsert({
          where:  { id },
          update: { ...data, userId, daysOfWeek: data.daysOfWeek ?? [] },
          create: { ...data, id, userId, daysOfWeek: data.daysOfWeek ?? [] },
        });
      }),
      ...doseEvents.map((e) => {
        const { id, ...data } = e as any;
        return prisma.doseEvent.upsert({
          where:  { id },
          update: { ...data, userId },
          create: { ...data, id, userId },
        });
      }),
    ]);

    res.json({
      synced: {
        medications: medications.length,
        schedules:   schedules.length,
        doseEvents:  doseEvents.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /sync/medications/:id ─────────────────────────────────────────────────
// 단일 Medication upsert (일정 저장 시 개별 push).

router.put('/medications/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data   = req.body as Record<string, unknown>;

    if (!data['name']) throw new AppError('name is required', 400);

    const existing = await prisma.medication.findUnique({ where: { id } });
    if (existing && existing.userId !== userId) throw new AppError('Forbidden', 403);

    const { id: _mId, ...mData } = data as any;
    const med = await prisma.medication.upsert({
      where:  { id },
      update: { ...mData, userId },
      create: { ...mData, id, userId },
    });
    res.json(med);
  } catch (err) {
    next(err);
  }
});

// ── PUT /sync/schedules/:id ───────────────────────────────────────────────────

router.put('/schedules/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data   = req.body as Record<string, unknown>;

    if (!data['medicationId']) throw new AppError('medicationId is required', 400);

    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (existing && existing.userId !== userId) throw new AppError('Forbidden', 403);

    const { id: _sId, ...sData } = data as any;
    const sched = await prisma.schedule.upsert({
      where:  { id },
      update: { ...sData, userId, daysOfWeek: sData.daysOfWeek ?? [] },
      create: { ...sData, id, userId, daysOfWeek: sData.daysOfWeek ?? [] },
    });
    res.json(sched);
  } catch (err) {
    next(err);
  }
});

// ── PUT /sync/dose-events/:id ─────────────────────────────────────────────────

router.put('/dose-events/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data   = req.body as Record<string, unknown>;

    if (!data['scheduleId']) throw new AppError('scheduleId is required', 400);

    const existing = await prisma.doseEvent.findUnique({ where: { id } });
    if (existing && existing.userId !== userId) throw new AppError('Forbidden', 403);

    const { id: _eId, ...eData } = data as any;
    const event = await prisma.doseEvent.upsert({
      where:  { id },
      update: { ...eData, userId },
      create: { ...eData, id, userId },
    });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

function ninetyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD prefix match
}

export default router;
