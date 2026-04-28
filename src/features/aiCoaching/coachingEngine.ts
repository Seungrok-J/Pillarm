import type { DoseEvent, Schedule } from '../../domain';

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface CoachingMessage {
  id:            string;
  type:          'suggest_time_change' | 'suggest_delay' | 'praise';
  message:       string;
  scheduleId?:   string;
  suggestedTime?: string;
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_THRESHOLD    = 3;   // 동일 시간대 누락 기준
const SNOOZE_THRESHOLD  = 10;  // 미루기 누적 기준
const STREAK_THRESHOLD  = 7;   // 연속 완료 칭찬 기준
const MAX_MESSAGES      = 3;

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addMinutes(time: string, delta: number): string {
  const [hh, mm] = time.split(':').map(Number);
  const total = ((hh * 60 + mm + delta) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** 이벤트 배열에서 최대 연속 완료 일수를 계산합니다. */
function calcMaxStreak(events: DoseEvent[]): number {
  // date → { taken: n, total: n } (skipped 제외)
  const dayMap = new Map<string, { taken: number; total: number }>();

  for (const e of events) {
    if (e.status === 'skipped') continue;
    const date = e.plannedAt.slice(0, 10);
    const cur = dayMap.get(date) ?? { taken: 0, total: 0 };
    cur.total++;
    if (e.status === 'taken' || e.status === 'late') cur.taken++;
    dayMap.set(date, cur);
  }

  const dates = Array.from(dayMap.keys()).sort();
  let maxStreak = 0;
  let streak    = 0;

  for (let i = 0; i < dates.length; i++) {
    const { taken, total } = dayMap.get(dates[i])!;
    const complete = total > 0 && taken === total;

    if (!complete) { streak = 0; continue; }

    if (i === 0) {
      streak = 1;
    } else {
      const prev = new Date(dates[i - 1]).getTime();
      const curr = new Date(dates[i]).getTime();
      const diffDays = Math.round((curr - prev) / 86_400_000);
      streak = diffDays === 1 ? streak + 1 : 1;
    }

    if (streak > maxStreak) maxStreak = streak;
  }

  return maxStreak;
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * 최근 30일 DoseEvent를 분석해 최대 3개의 코칭 메시지를 생성합니다.
 * 우선순위: suggest_time_change > suggest_delay > praise
 */
export function generateCoachingMessages(
  events:    DoseEvent[],
  schedules: Schedule[],
): CoachingMessage[] {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const recent = events.filter((e) => e.plannedAt >= cutoff);

  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));
  const messages: CoachingMessage[] = [];

  // ── 규칙 1: suggest_time_change ──────────────────────────────────────────
  // scheduleId + 시간대(hour) 조합으로 누락 횟수를 집계
  const missSlot = new Map<string, { scheduleId: string; hour: number; count: number }>();

  for (const e of recent) {
    if (e.status !== 'missed') continue;
    const hour = new Date(e.plannedAt).getHours();
    const key  = `${e.scheduleId}:${hour}`;
    const cur  = missSlot.get(key) ?? { scheduleId: e.scheduleId, hour, count: 0 };
    cur.count++;
    missSlot.set(key, cur);
  }

  const timeChangeCandidates = Array.from(missSlot.values())
    .filter((c) => c.count >= MISS_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  for (const c of timeChangeCandidates) {
    if (messages.length >= MAX_MESSAGES) break;
    const slotStr      = `${pad2(c.hour)}:00`;
    const suggestedTime = addMinutes(slotStr, 60); // 1시간 뒤 제안
    messages.push({
      id:            `time_change_${c.scheduleId}_${c.hour}`,
      type:          'suggest_time_change',
      message:       `${slotStr} 복용을 자주 놓치고 있어요 (${c.count}회). ${suggestedTime}으로 시간을 변경해볼까요?`,
      scheduleId:    c.scheduleId,
      suggestedTime,
    });
  }

  // ── 규칙 2: suggest_delay ────────────────────────────────────────────────
  // 스케줄별 snoozeCount 누적 합산
  const snoozeTotal = new Map<string, number>();
  for (const e of recent) {
    snoozeTotal.set(e.scheduleId, (snoozeTotal.get(e.scheduleId) ?? 0) + e.snoozeCount);
  }

  const delayCandidates = Array.from(snoozeTotal.entries())
    .filter(([, total]) => total >= SNOOZE_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  for (const [scheduleId, total] of delayCandidates) {
    if (messages.length >= MAX_MESSAGES) break;
    const sched = scheduleMap.get(scheduleId);
    if (!sched?.times.length) continue;
    const suggestedTime = addMinutes(sched.times[0], 30);
    messages.push({
      id:            `suggest_delay_${scheduleId}`,
      type:          'suggest_delay',
      message:       `알림을 자주 미루고 있어요 (${total}회). ${suggestedTime}으로 30분 늦춰볼까요?`,
      scheduleId,
      suggestedTime,
    });
  }

  // ── 규칙 3: praise ────────────────────────────────────────────────────────
  if (messages.length < MAX_MESSAGES) {
    const streak = calcMaxStreak(recent);
    if (streak >= STREAK_THRESHOLD) {
      messages.push({
        id:      'praise_streak',
        type:    'praise',
        message: `훌륭해요! ${streak}일 연속으로 복용을 완료했어요. 이 페이스를 유지해봐요 💪`,
      });
    }
  }

  return messages;
}
