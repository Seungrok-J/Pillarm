import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';
import { sendPush } from '../services/fcmService';
import { AppError } from '../middleware/errorHandler';
import { DAILY_SCAN_LIMIT } from '../config/limits';

const router = Router();

// 모든 /admin/* 엔드포인트는 관리자 인증 필수
router.use(requireAdmin);

// ── GET /admin/stats  — 서비스 지표 ───────────────────────────────────────────
//
// PRD Phase 5(수익 모델)의 착수 판단에 필요한 네 지표를 여기서 낸다.
//   보호자 그룹 사용률 · 보호자당 환자 수 · 스캔 실사용 빈도 · 리텐션
// 외부 분석 SDK 를 붙이지 않는다 — 네 지표 모두 기존 테이블에서 유도되고,
// 복약 앱에 서드파티 트래커를 넣는 것은 민감정보 관점에서도 부담이다.

/** 서버가 미러링하는 DoseEvent 보관 기간(일). 스키마 주석과 같은 값. */
const DOSE_EVENT_WINDOW_DAYS = 90;

/** 스캔 지표 집계 구간(일). */
const SCAN_WINDOW_DAYS = 30;

/** 리텐션을 측정할 경과일 지점. */
const RETENTION_DAYS = [1, 7, 30] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 지표에서 제외할 사용자 조건 — 관리자(개발자 본인) 계정.
 *
 * 기기 테스트가 오랫동안 프로덕션 DB 에 기록돼 왔기 때문에 개발용 계정이 섞여 있다.
 * 그대로 두면 전체 사용자를 부풀리고, 복용 체크를 하지 않으니 리텐션을 깎고,
 * 보호자 그룹 사용률의 분모만 키운다.
 */
const EXCLUDE_ADMINS = { isAdmin: false } as const;

function ymdKST(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

router.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date();
    const nowMs = now.getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const mirrorStart = new Date(nowMs - DOSE_EVENT_WINDOW_DAYS * DAY_MS);

    const [
      totalUsers,
      adminUsers,
      activeToday,
      newThisWeek,
      usersWithSchedule,
      circleCount,
      circleOwners,
      memberships,
      scanRows,
      cohortUsers,
      lastTakenRows,
    ] = await Promise.all([
      prisma.user.count({ where: EXCLUDE_ADMINS }),

      // 제외한 관리자 수 — 응답에 함께 실어 지표를 해석할 때 참고하도록 한다
      prisma.user.count({ where: { isAdmin: true } }),

      // 오늘 RefreshToken을 새로 발급(= 로그인)한 고유 유저 수
      prisma.refreshToken
        .findMany({
          where:    { createdAt: { gte: todayStart }, user: EXCLUDE_ADMINS },
          select:   { userId: true },
          distinct: ['userId'],
        })
        .then((rows) => rows.length),

      prisma.user.count({ where: { ...EXCLUDE_ADMINS, createdAt: { gte: weekStart } } }),

      // 일정을 하나라도 만든 사용자 — 가입만 하고 이탈한 사용자와 구분한다
      prisma.user.count({ where: { ...EXCLUDE_ADMINS, schedules: { some: {} } } }),

      prisma.careCircle.count({ where: { owner: EXCLUDE_ADMINS } }),

      prisma.careCircle.findMany({
        where:  { owner: EXCLUDE_ADMINS },
        select: { ownerUserId: true },
      }),

      prisma.careMember.findMany({
        where:  { member: EXCLUDE_ADMINS },
        select: { memberUserId: true, careCircleId: true },
      }),

      // ScanUsage.date 는 "YYYY-MM-DD" 문자열 — 이 형식은 사전순 = 시간순이라
      // 문자열 비교로 구간을 자를 수 있다.
      prisma.scanUsage.findMany({
        where: {
          date: { gte: ymdKST(nowMs - SCAN_WINDOW_DAYS * DAY_MS) },
          user: EXCLUDE_ADMINS,
        },
        select: { userId: true, count: true },
      }),

      // 리텐션 코호트는 DoseEvent 보관 구간 안쪽으로 제한한다.
      // 그보다 오래된 사용자는 활동 기록이 이미 지워져 "이탈" 로 잘못 잡힌다.
      prisma.user.findMany({
        where:  { ...EXCLUDE_ADMINS, createdAt: { gte: mirrorStart } },
        select: { id: true, createdAt: true },
      }),

      // 사용자별 마지막 복용 체크 시각.
      // takenAt 은 ISO 8601 문자열이라 사전순 최대 = 최근 시각이다.
      prisma.doseEvent.groupBy({
        by:    ['userId'],
        where: { user: EXCLUDE_ADMINS },
        _max:  { takenAt: true },
      }),
    ]);

    // ── 보호자 그룹 ───────────────────────────────────────────────────────────
    // 그룹에 관여한 사용자 = 소유자(환자) ∪ 구성원(보호자)
    const ownerIds  = new Set(circleOwners.map((c) => c.ownerUserId));
    const memberIds = new Set(memberships.map((m) => m.memberUserId));
    const usersInAnyCircle = new Set([...ownerIds, ...memberIds]).size;

    // 보호자 1명이 여러 그룹(= 여러 환자)에 속할 수 있다
    const circlesPerCaregiver = new Map<string, Set<string>>();
    for (const m of memberships) {
      const set = circlesPerCaregiver.get(m.memberUserId) ?? new Set<string>();
      set.add(m.careCircleId);
      circlesPerCaregiver.set(m.memberUserId, set);
    }
    const caregiverCount = circlesPerCaregiver.size;
    const totalCareLinks = [...circlesPerCaregiver.values()].reduce((sum, s) => sum + s.size, 0);

    // ── 스캔 ──────────────────────────────────────────────────────────────────
    const scanUserIds = new Set(scanRows.map((r) => r.userId));
    const totalScans  = scanRows.reduce((sum, r) => sum + r.count, 0);
    // 한도에 실제로 걸린 (사용자, 날짜) 건수 — "무제한 스캔" 이 혜택이 되는지의 근거
    const dailyLimitHits = scanRows.filter((r) => r.count >= DAILY_SCAN_LIMIT).length;

    // ── 리텐션 ────────────────────────────────────────────────────────────────
    // 정의: 가입 후 N일이 지난 사용자 중, 가입일+N일 이후에도 복용 체크 기록이
    // 남아 있는 비율. 코호트 크기가 작아도 흔들리지 않고 N에 대해 단조롭다.
    const lastTakenByUser = new Map<string, number>();
    for (const row of lastTakenRows) {
      const takenAt = row._max.takenAt;
      if (!takenAt) continue;
      const ms = Date.parse(takenAt);
      if (!Number.isNaN(ms)) lastTakenByUser.set(row.userId, ms);
    }

    const retention: Record<string, { eligible: number; retained: number; rate: number }> = {};
    for (const days of RETENTION_DAYS) {
      let eligible = 0;
      let retained = 0;
      for (const u of cohortUsers) {
        const signupMs = u.createdAt.getTime();
        if (nowMs - signupMs < days * DAY_MS) continue; // 아직 N일이 안 지남
        eligible += 1;
        const lastMs = lastTakenByUser.get(u.id);
        if (lastMs !== undefined && lastMs >= signupMs + days * DAY_MS) retained += 1;
      }
      retention[`d${days}`] = { eligible, retained, rate: rate(retained, eligible) };
    }

    const activeSince = (days: number) =>
      [...lastTakenByUser.values()].filter((ms) => ms >= nowMs - days * DAY_MS).length;

    res.json({
      // 기존 필드 — 클라이언트 하위 호환을 위해 이름을 유지한다.
      // 값은 이제 관리자 계정을 제외한 수치다.
      totalUsers,
      activeToday,
      newThisWeek,
      /** 지표에서 제외된 관리자 계정 수 */
      excludedAdmins: adminUsers,

      activation: {
        usersWithSchedule,
        rate: rate(usersWithSchedule, totalUsers),
      },

      careCircle: {
        circleCount,
        usersInAnyCircle,
        /** PRD Phase 5 의 착수 판단 지표. 0.10 미만이면 전제를 재검토한다. */
        adoptionRate: rate(usersInAnyCircle, totalUsers),
        caregiverCount,
        avgPatientsPerCaregiver:
          caregiverCount === 0 ? 0 : Math.round((totalCareLinks / caregiverCount) * 100) / 100,
      },

      scan: {
        windowDays: SCAN_WINDOW_DAYS,
        dailyLimit: DAILY_SCAN_LIMIT,
        totalScans,
        uniqueUsers: scanUserIds.size,
        avgScansPerUser:
          scanUserIds.size === 0 ? 0 : Math.round((totalScans / scanUserIds.size) * 100) / 100,
        dailyLimitHits,
      },

      retention: {
        /** 코호트를 이 구간 안쪽으로 제한한 이유는 위 주석 참고 */
        cohortWindowDays: DOSE_EVENT_WINDOW_DAYS,
        activeLast7d:  activeSince(7),
        activeLast30d: activeSince(30),
        ...retention,
      },

      generatedAt: now.toISOString(),
    });
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
