/**
 * streakCalculator 단위 테스트
 *
 * getCurrentStreak edge cases:
 *   - 빈 배열, 1일, 연속 N일
 *   - 중간에 누락이 낀 경우
 *   - 오늘 아직 복용 전 (all 'scheduled') — 스트릭에 포함하지 않음
 *   - 오늘 부분 완료 (mixed taken + scheduled)
 *   - skipped 로 스트릭 중단
 *
 * isPerfectWeek edge cases:
 *   - 빈 배열 → false
 *   - 이번 주 전체 taken → true
 *   - 누락(missed) 1건 → false
 *   - skipped 는 perfect week 를 깨지 않음
 *   - 오늘 scheduled (진행 중) → 아직 누락 없음 → true
 *   - 일요일(0) 처리
 */

import { getCurrentStreak, isPerfectWeek } from '../../../src/features/points/streakCalculator';
import type { DoseEvent, DoseStatus } from '../../../src/domain';

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function makeEvent(
  id: string,
  date: string,
  status: DoseStatus = 'taken',
  time = 'T08:00:00',
): DoseEvent {
  return {
    id,
    scheduleId:   'sched-1',
    medicationId: 'med-1',
    plannedAt:    `${date}${time}`,
    status,
    snoozeCount:  0,
    source:       'notification',
    createdAt:    `${date}T00:00:00Z`,
    updatedAt:    `${date}T00:00:00Z`,
  };
}

/** 연속 N일 전부 taken 인 이벤트를 today 기준 역순으로 생성 */
function makeConsecutiveTaken(today: string, days: number): DoseEvent[] {
  const events: DoseEvent[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    events.push(makeEvent(`evt-${i}`, dateStr, 'taken'));
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// getCurrentStreak
// ═══════════════════════════════════════════════════════════════════════════════

describe('getCurrentStreak', () => {
  it('빈 배열 → 0', () => {
    expect(getCurrentStreak([])).toBe(0);
  });

  it('1일 취한 → 1', () => {
    expect(getCurrentStreak([makeEvent('e', '2026-04-24', 'taken')])).toBe(1);
  });

  it('7일 연속 taken → 7', () => {
    const events = makeConsecutiveTaken('2026-04-24', 7);
    expect(getCurrentStreak(events)).toBe(7);
  });

  it('14일 연속 taken → 14', () => {
    expect(getCurrentStreak(makeConsecutiveTaken('2026-04-24', 14))).toBe(14);
  });

  // ── 누락 케이스 ─────────────────────────────────────────────────────────────

  it('가장 최근 날에 missed → 0', () => {
    const events = [
      makeEvent('e1', '2026-04-24', 'missed'),
      makeEvent('e2', '2026-04-23', 'taken'),
    ];
    expect(getCurrentStreak(events)).toBe(0);
  });

  it('중간에 missed → missed 이후 연속일만 카운트', () => {
    // Apr 22: taken, Apr 23: missed, Apr 24: taken → streak = 1 (Apr 24만)
    const events = [
      makeEvent('e1', '2026-04-22', 'taken'),
      makeEvent('e2', '2026-04-23', 'missed'),
      makeEvent('e3', '2026-04-24', 'taken'),
    ];
    expect(getCurrentStreak(events)).toBe(1);
  });

  it('skipped 도 스트릭을 깬다', () => {
    const events = [
      makeEvent('e1', '2026-04-23', 'taken'),
      makeEvent('e2', '2026-04-24', 'skipped'),
    ];
    expect(getCurrentStreak(events)).toBe(0);
  });

  // ── 오늘 아직 복용 전 ─────────────────────────────────────────────────────────

  it('오늘 전부 scheduled(복용 전) → 스트릭에 포함 안 하고 어제부터 카운트', () => {
    const events = [
      makeEvent('e1', '2026-04-24', 'scheduled'), // 오늘
      makeEvent('e2', '2026-04-23', 'taken'),
      makeEvent('e3', '2026-04-22', 'taken'),
    ];
    expect(getCurrentStreak(events)).toBe(2); // Apr 23, 22 만
  });

  it('오늘 전부 scheduled + 어제 missed → streak = 0', () => {
    const events = [
      makeEvent('e1', '2026-04-24', 'scheduled'),
      makeEvent('e2', '2026-04-23', 'missed'),
    ];
    expect(getCurrentStreak(events)).toBe(0);
  });

  // ── 부분 완료 ────────────────────────────────────────────────────────────────

  it('오늘 taken + scheduled 혼재 → taken 이 있으므로 완료일로 카운트', () => {
    const events = [
      makeEvent('e1', '2026-04-24', 'taken', 'T08:00:00'),
      makeEvent('e2', '2026-04-24', 'scheduled', 'T20:00:00'), // 저녁 아직 안 먹음
    ];
    expect(getCurrentStreak(events)).toBe(1);
  });

  // ── late 는 완료로 인정 ─────────────────────────────────────────────────────

  it('late 상태도 완료일로 카운트', () => {
    const events = [
      makeEvent('e1', '2026-04-24', 'late'),
      makeEvent('e2', '2026-04-23', 'taken'),
    ];
    expect(getCurrentStreak(events)).toBe(2);
  });

  // ── 이벤트 없는 날은 skip ───────────────────────────────────────────────────

  it('이벤트 없는 날(공백)은 스트릭을 깨지 않는다', () => {
    // Apr 22: taken, Apr 23: 이벤트 없음(공백), Apr 24: taken
    const events = [
      makeEvent('e1', '2026-04-22', 'taken'),
      makeEvent('e2', '2026-04-24', 'taken'),
    ];
    // Apr 24 → taken(1), Apr 23 → 없음(skip), Apr 22 → taken(2)
    expect(getCurrentStreak(events)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isPerfectWeek
// ═══════════════════════════════════════════════════════════════════════════════

describe('isPerfectWeek', () => {
  // today = Wednesday 2026-04-22 (수요일, getDay=3)
  // 이번 주 월요일 = 2026-04-20
  const WEDNESDAY = new Date('2026-04-22T12:00:00Z');

  it('빈 배열 → false', () => {
    expect(isPerfectWeek([], WEDNESDAY)).toBe(false);
  });

  it('이번 주 전체 taken → true', () => {
    const events = [
      makeEvent('e1', '2026-04-20', 'taken'),
      makeEvent('e2', '2026-04-21', 'taken'),
      makeEvent('e3', '2026-04-22', 'taken'),
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(true);
  });

  it('이번 주 missed 1건 → false', () => {
    const events = [
      makeEvent('e1', '2026-04-20', 'taken'),
      makeEvent('e2', '2026-04-21', 'missed'),
      makeEvent('e3', '2026-04-22', 'taken'),
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(false);
  });

  it('skipped 는 perfect week 를 깨지 않는다', () => {
    const events = [
      makeEvent('e1', '2026-04-20', 'taken'),
      makeEvent('e2', '2026-04-21', 'skipped'), // 의도적 skip
      makeEvent('e3', '2026-04-22', 'taken'),
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(true);
  });

  it('오늘 아직 scheduled (복용 전) → 누락 없으므로 true', () => {
    const events = [
      makeEvent('e1', '2026-04-20', 'taken'),
      makeEvent('e2', '2026-04-21', 'taken'),
      makeEvent('e3', '2026-04-22', 'scheduled'), // 오늘 아직 안 먹음
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(true);
  });

  it('이전 주 이벤트는 무시된다', () => {
    const events = [
      makeEvent('e1', '2026-04-13', 'missed'), // 지난 주
      makeEvent('e2', '2026-04-20', 'taken'),
      makeEvent('e3', '2026-04-21', 'taken'),
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(true);
  });

  it('이번 주 이벤트가 없으면 false', () => {
    const events = [
      makeEvent('e1', '2026-04-13', 'taken'), // 지난 주 이벤트만
    ];
    expect(isPerfectWeek(events, WEDNESDAY)).toBe(false);
  });

  it('today = 일요일(0) → 월요일 계산이 올바르다', () => {
    // 2026-04-26은 일요일(getDay=0)
    // 이번 주 월요일 = 2026-04-20
    const SUNDAY = new Date('2026-04-26T12:00:00Z');
    const events = [
      makeEvent('e1', '2026-04-20', 'taken'),
      makeEvent('e2', '2026-04-26', 'taken'),
    ];
    expect(isPerfectWeek(events, SUNDAY)).toBe(true);
  });
});
