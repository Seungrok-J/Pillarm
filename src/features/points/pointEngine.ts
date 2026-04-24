import { getDatabase, getDoseEventsByDateRange } from '../../db';
import { generateId } from '../../utils';
import { getCurrentStreak, isPerfectWeek } from './streakCalculator';
import type { DoseEvent, PointLedger, PointReason } from '../../domain';

/** plannedAt 기준 앞쪽 허용 범위: 30분 */
const EARLY_WINDOW_MS = 30 * 60 * 1000;

const DELTA = {
  dose_taken:   10,
  streak_7days: 50,
  perfect_week: 30,
} as const;

// ── 내부 DB 헬퍼 ──────────────────────────────────────────────────────────────

async function latestBalance(userId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ balance: number }>(
    'SELECT balance FROM point_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    userId,
  );
  return row?.balance ?? 0;
}

async function insertEntry(entry: PointLedger): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO point_ledger
       (id, user_id, reason, delta, balance, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.userId,
    entry.reason,
    entry.delta,
    entry.balance,
    entry.refId ?? null,
    entry.createdAt,
  );
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * 복용 완료 +10 적립.
 * 신뢰 범위: [plannedAt - 30분, plannedAt + graceMinutes]
 * 멱등: 같은 doseEvent 에 대해 중복 적립하지 않음.
 */
export async function awardDoseTaken(
  doseEvent: DoseEvent,
  graceMinutes: number,
): Promise<PointLedger | null> {
  if (!doseEvent.takenAt) return null;

  const plannedMs = new Date(doseEvent.plannedAt).getTime();
  const takenMs   = new Date(doseEvent.takenAt).getTime();
  const inWindow  =
    takenMs >= plannedMs - EARLY_WINDOW_MS &&
    takenMs <= plannedMs + graceMinutes * 60_000;
  if (!inWindow) return null;

  const db  = await getDatabase();
  const dup = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM point_ledger
       WHERE user_id = 'local' AND reason = 'dose_taken' AND ref_id = ?`,
    doseEvent.id,
  );
  if (dup) return null;

  const prev  = await latestBalance('local');
  const entry: PointLedger = {
    id:        generateId(),
    userId:    'local',
    reason:    'dose_taken',
    delta:     DELTA.dose_taken,
    balance:   prev + DELTA.dose_taken,
    refId:     doseEvent.id,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(entry);
  return entry;
}

/**
 * 연속 7일 달성 +50 적립.
 * streak 가 7의 배수일 때 1회 적립 (최근 7일 내 중복 방지).
 */
export async function awardStreakBonus(userId: string): Promise<PointLedger | null> {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const events = await getDoseEventsByDateRange(from.toISOString(), new Date().toISOString());

  const streak = getCurrentStreak(events);
  if (streak === 0 || streak % 7 !== 0) return null;

  const db          = await getDatabase();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 7);
  const dup = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM point_ledger
       WHERE user_id = ? AND reason = 'streak_7days'
         AND date(created_at) >= ?`,
    userId,
    windowStart.toISOString().slice(0, 10),
  );
  if (dup) return null;

  const prev  = await latestBalance(userId);
  const entry: PointLedger = {
    id:        generateId(),
    userId,
    reason:    'streak_7days',
    delta:     DELTA.streak_7days,
    balance:   prev + DELTA.streak_7days,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(entry);
  return entry;
}

/**
 * 주간 누락 0건 +30 적립.
 * 이번 주(월~오늘) 이미 적립된 경우 skip.
 */
export async function awardPerfectWeek(userId: string): Promise<PointLedger | null> {
  const monday = new Date();
  const dow    = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);

  const events = await getDoseEventsByDateRange(
    monday.toISOString(),
    new Date().toISOString(),
  );
  if (!isPerfectWeek(events)) return null;

  const db  = await getDatabase();
  const dup = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM point_ledger
       WHERE user_id = ? AND reason = 'perfect_week'
         AND date(created_at) >= ?`,
    userId,
    monday.toISOString().slice(0, 10),
  );
  if (dup) return null;

  const prev  = await latestBalance(userId);
  const entry: PointLedger = {
    id:        generateId(),
    userId,
    reason:    'perfect_week',
    delta:     DELTA.perfect_week,
    balance:   prev + DELTA.perfect_week,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(entry);
  return entry;
}

/**
 * 포인트 소비. 잔액 부족 시 false 반환.
 */
export async function spendPoints(
  userId: string,
  amount: number,
  reason: PointReason,
): Promise<boolean> {
  const current = await latestBalance(userId);
  if (current < amount) return false;

  const entry: PointLedger = {
    id:        generateId(),
    userId,
    reason,
    delta:     -amount,
    balance:   current - amount,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(entry);
  return true;
}

export async function getBalance(userId: string): Promise<number> {
  return latestBalance(userId);
}

export async function getHistory(userId: string): Promise<PointLedger[]> {
  const db   = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    reason: string;
    delta: number;
    balance: number;
    ref_id: string | null;
    created_at: string;
  }>('SELECT * FROM point_ledger WHERE user_id = ? ORDER BY created_at DESC', userId);
  return rows.map((r) => ({
    id:        r.id,
    userId:    r.user_id,
    reason:    r.reason as PointReason,
    delta:     r.delta,
    balance:   r.balance,
    refId:     r.ref_id ?? undefined,
    createdAt: r.created_at,
  }));
}
