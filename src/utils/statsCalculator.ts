import type { DoseEvent } from '../domain';

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface DayStats {
  dayOfWeek: number;      // 0=일 ~ 6=토 (JS getDay() 값)
  label: string;          // '일', '월', ..., '토'
  total: number;          // taken + missed + late 합계
  taken: number;
  completionRate: number; // taken / total, total === 0 이면 0
}

export interface WeeklyStats {
  total: number;           // taken + missed + late
  taken: number;
  missed: number;
  late: number;
  completionRate: number;  // taken / total, total === 0 이면 0
  byDayOfWeek: DayStats[]; // 인덱스 = dayOfWeek (0=일 ~ 6=토)
}

export interface MissedPattern {
  timeSlot: string; // "HH:00" 형식
  count: number;
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** plannedAt 로컬 ISO 문자열("YYYY-MM-DDTHH:mm:ss")에서 JS getDay() 값 반환 */
function dayOfWeekFrom(plannedAt: string): number {
  const [y, mo, d] = plannedAt.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

// ── 공개 함수 ─────────────────────────────────────────────────────────────────

/**
 * 주어진 DoseEvent 배열에서 기간 통계를 계산합니다.
 * 완료율 = taken / (taken + missed + late)
 * scheduled, skipped 는 계산에서 제외합니다.
 */
export function calculateWeeklyStats(events: DoseEvent[]): WeeklyStats {
  const actionable = events.filter(
    (e) => e.status === 'taken' || e.status === 'missed' || e.status === 'late',
  );

  const total  = actionable.length;
  const taken  = actionable.filter((e) => e.status === 'taken').length;
  const missed = actionable.filter((e) => e.status === 'missed').length;
  const late   = actionable.filter((e) => e.status === 'late').length;
  const completionRate = total > 0 ? taken / total : 0;

  // 요일별 집계 (index = getDay())
  const byDay: Array<{ total: number; taken: number }> = Array.from(
    { length: 7 },
    () => ({ total: 0, taken: 0 }),
  );

  for (const e of actionable) {
    const dow = dayOfWeekFrom(e.plannedAt);
    byDay[dow].total += 1;
    if (e.status === 'taken') byDay[dow].taken += 1;
  }

  return {
    total,
    taken,
    missed,
    late,
    completionRate,
    byDayOfWeek: byDay.map((d, i) => ({
      dayOfWeek: i,
      label: DAY_LABELS[i],
      total: d.total,
      taken: d.taken,
      completionRate: d.total > 0 ? d.taken / d.total : 0,
    })),
  };
}

/**
 * 누락(missed) 이벤트를 시간대별로 집계하여 횟수 내림차순으로 반환합니다.
 * 동률인 경우 timeSlot 오름차순으로 정렬합니다.
 */
export function calculateMissedPatterns(events: DoseEvent[]): MissedPattern[] {
  const counts: Record<string, number> = {};

  for (const e of events) {
    if (e.status !== 'missed') continue;
    const slot = `${e.plannedAt.slice(11, 13)}:00`;
    counts[slot] = (counts[slot] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([timeSlot, count]) => ({ timeSlot, count }))
    .sort(
      (a, b) => b.count - a.count || a.timeSlot.localeCompare(b.timeSlot),
    );
}
