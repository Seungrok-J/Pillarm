/**
 * statsCalculator 단위 테스트
 *
 * 검증 항목:
 *   calculateWeeklyStats
 *     - 빈 이벤트 배열 (edge case)
 *     - 전부 taken
 *     - 전부 missed (edge case)
 *     - taken / missed / late 혼합
 *     - scheduled · skipped 는 계산에서 제외
 *     - byDayOfWeek 요일 집계
 *
 *   calculateMissedPatterns
 *     - 빈 이벤트 배열 (edge case)
 *     - missed 없음 (edge case)
 *     - 같은 시간대 누락 누적
 *     - count 내림차순 정렬
 *     - 동률 → timeSlot 오름차순 보조 정렬
 */

import {
  calculateWeeklyStats,
  calculateMissedPatterns,
} from '../../src/utils/statsCalculator';
import type { DoseEvent } from '../../src/domain';

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────

let _seq = 0;
function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  _seq += 1;
  return {
    id: `evt-${_seq}`,
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: '2026-04-23T08:00:00', // Thursday
    status: 'scheduled',
    snoozeCount: 0,
    source: 'notification',
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  _seq = 0;
});

// ════════════════════════════════════════════════════════════════════════════
// calculateWeeklyStats
// ════════════════════════════════════════════════════════════════════════════

describe('calculateWeeklyStats', () => {
  // ── edge case: 이벤트 없음 ─────────────────────────────────────────────────
  describe('이벤트 없는 경우 (edge case)', () => {
    it('빈 배열이면 모든 카운트가 0이고 완료율도 0이다', () => {
      const stats = calculateWeeklyStats([]);

      expect(stats.total).toBe(0);
      expect(stats.taken).toBe(0);
      expect(stats.missed).toBe(0);
      expect(stats.late).toBe(0);
      expect(stats.completionRate).toBe(0);
    });

    it('빈 배열이면 byDayOfWeek 의 모든 요일 total/taken 이 0이다', () => {
      const stats = calculateWeeklyStats([]);
      expect(stats.byDayOfWeek).toHaveLength(7);
      stats.byDayOfWeek.forEach((d) => {
        expect(d.total).toBe(0);
        expect(d.taken).toBe(0);
        expect(d.completionRate).toBe(0);
      });
    });
  });

  // ── edge case: 전부 누락 ───────────────────────────────────────────────────
  describe('전부 missed 인 경우 (edge case)', () => {
    it('완료율이 0이다', () => {
      const events = [
        makeEvent({ status: 'missed' }),
        makeEvent({ status: 'missed' }),
        makeEvent({ status: 'missed' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.total).toBe(3);
      expect(stats.taken).toBe(0);
      expect(stats.missed).toBe(3);
      expect(stats.completionRate).toBe(0);
    });

    it('byDayOfWeek 해당 요일의 completionRate 가 0이다', () => {
      const events = [makeEvent({ status: 'missed', plannedAt: '2026-04-20T08:00:00' })]; // 월요일
      const stats = calculateWeeklyStats(events);

      const monday = stats.byDayOfWeek[1]; // getDay() 1 = 월
      expect(monday.total).toBe(1);
      expect(monday.taken).toBe(0);
      expect(monday.completionRate).toBe(0);
    });
  });

  // ── 전부 taken ────────────────────────────────────────────────────────────
  describe('전부 taken 인 경우', () => {
    it('완료율이 1이다', () => {
      const events = [
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'taken' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.completionRate).toBe(1);
      expect(stats.total).toBe(2);
      expect(stats.taken).toBe(2);
      expect(stats.missed).toBe(0);
      expect(stats.late).toBe(0);
    });
  });

  // ── 혼합 ─────────────────────────────────────────────────────────────────
  describe('taken / missed / late 혼합', () => {
    it('완료율 = taken / (taken + missed + late)', () => {
      const events = [
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'missed' }),
        makeEvent({ status: 'late' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.total).toBe(4);
      expect(stats.taken).toBe(2);
      expect(stats.missed).toBe(1);
      expect(stats.late).toBe(1);
      expect(stats.completionRate).toBeCloseTo(0.5);
    });

    it('소수 완료율도 정확히 계산된다 (3/4 = 0.75)', () => {
      const events = [
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'missed' }),
      ];
      expect(calculateWeeklyStats(events).completionRate).toBeCloseTo(0.75);
    });
  });

  // ── scheduled / skipped 제외 ────────────────────────────────────────────
  describe('scheduled · skipped 제외', () => {
    it('scheduled 이벤트는 total 에 포함되지 않는다', () => {
      const events = [
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'scheduled' }),
        makeEvent({ status: 'scheduled' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.total).toBe(1);
      expect(stats.taken).toBe(1);
      expect(stats.completionRate).toBe(1);
    });

    it('skipped 이벤트는 total 에 포함되지 않는다', () => {
      const events = [
        makeEvent({ status: 'taken' }),
        makeEvent({ status: 'skipped' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.total).toBe(1);
    });

    it('scheduled·skipped 만 있으면 완료율 0, total 0', () => {
      const events = [
        makeEvent({ status: 'scheduled' }),
        makeEvent({ status: 'skipped' }),
      ];
      const stats = calculateWeeklyStats(events);

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });

  // ── 요일별 집계 ──────────────────────────────────────────────────────────
  describe('byDayOfWeek 요일 집계', () => {
    it('byDayOfWeek 는 항상 7개 요소를 가진다', () => {
      expect(calculateWeeklyStats([]).byDayOfWeek).toHaveLength(7);
    });

    it('dayOfWeek 인덱스와 label 이 매핑된다', () => {
      const stats = calculateWeeklyStats([]);
      const labels = ['일', '월', '화', '수', '목', '금', '토'];
      stats.byDayOfWeek.forEach((d, i) => {
        expect(d.dayOfWeek).toBe(i);
        expect(d.label).toBe(labels[i]);
      });
    });

    it('이벤트가 올바른 요일에 집계된다', () => {
      // 2026-04-20 = 월요일 (getDay()=1), 2026-04-26 = 일요일 (getDay()=0)
      const events = [
        makeEvent({ status: 'taken',  plannedAt: '2026-04-20T08:00:00' }), // 월
        makeEvent({ status: 'taken',  plannedAt: '2026-04-20T20:00:00' }), // 월
        makeEvent({ status: 'missed', plannedAt: '2026-04-26T08:00:00' }), // 일
      ];
      const stats = calculateWeeklyStats(events);

      const monday = stats.byDayOfWeek[1];
      expect(monday.total).toBe(2);
      expect(monday.taken).toBe(2);
      expect(monday.completionRate).toBe(1);

      const sunday = stats.byDayOfWeek[0];
      expect(sunday.total).toBe(1);
      expect(sunday.taken).toBe(0);
      expect(sunday.completionRate).toBe(0);
    });

    it('이벤트 없는 요일의 completionRate 는 0이다', () => {
      const events = [makeEvent({ status: 'taken', plannedAt: '2026-04-20T08:00:00' })]; // 월만
      const stats = calculateWeeklyStats(events);

      // 화 ~ 일은 이벤트 없음
      [0, 2, 3, 4, 5, 6].forEach((dow) => {
        expect(stats.byDayOfWeek[dow].total).toBe(0);
        expect(stats.byDayOfWeek[dow].completionRate).toBe(0);
      });
    });

    it('같은 날 여러 이벤트의 completionRate 를 정확히 계산한다', () => {
      // 수요일 (getDay()=3): taken 1, missed 1 → 50%
      const events = [
        makeEvent({ status: 'taken',  plannedAt: '2026-04-22T08:00:00' }),
        makeEvent({ status: 'missed', plannedAt: '2026-04-22T20:00:00' }),
      ];
      const stats = calculateWeeklyStats(events);

      const wednesday = stats.byDayOfWeek[3];
      expect(wednesday.total).toBe(2);
      expect(wednesday.taken).toBe(1);
      expect(wednesday.completionRate).toBeCloseTo(0.5);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calculateMissedPatterns
// ════════════════════════════════════════════════════════════════════════════

describe('calculateMissedPatterns', () => {
  // ── edge case: 빈 배열 ───────────────────────────────────────────────────
  it('이벤트 없으면 빈 배열을 반환한다 (edge case)', () => {
    expect(calculateMissedPatterns([])).toEqual([]);
  });

  // ── edge case: missed 없음 ───────────────────────────────────────────────
  it('missed 이벤트가 없으면 빈 배열을 반환한다 (edge case)', () => {
    const events = [
      makeEvent({ status: 'taken' }),
      makeEvent({ status: 'scheduled' }),
      makeEvent({ status: 'late' }),
    ];
    expect(calculateMissedPatterns(events)).toEqual([]);
  });

  // ── 단일 시간대 ─────────────────────────────────────────────────────────
  it('단일 missed 이벤트는 count 1 로 반환된다', () => {
    const events = [makeEvent({ status: 'missed', plannedAt: '2026-04-23T08:00:00' })];
    const result = calculateMissedPatterns(events);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ timeSlot: '08:00', count: 1 });
  });

  // ── 같은 시간대 누적 ────────────────────────────────────────────────────
  it('같은 시간대 누락이 count 에 누적된다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T08:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-21T08:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-22T08:00:00' }),
    ];
    const result = calculateMissedPatterns(events);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ timeSlot: '08:00', count: 3 });
  });

  // ── 정렬: count 내림차순 ─────────────────────────────────────────────────
  it('count 가 많은 시간대가 앞에 온다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T13:00:00' }), // 13:00
      makeEvent({ status: 'missed', plannedAt: '2026-04-21T13:00:00' }), // 13:00
      makeEvent({ status: 'missed', plannedAt: '2026-04-21T13:00:00' }), // 13:00
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T08:00:00' }), // 08:00
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T20:00:00' }), // 20:00
    ];
    const result = calculateMissedPatterns(events);

    expect(result[0].timeSlot).toBe('13:00');
    expect(result[0].count).toBe(3);
    expect(result[1].count).toBe(1);
    expect(result[2].count).toBe(1);
  });

  // ── 동률 보조 정렬 ───────────────────────────────────────────────────────
  it('count 동률이면 timeSlot 오름차순으로 정렬된다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T20:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T08:00:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-20T13:00:00' }),
    ];
    const result = calculateMissedPatterns(events);

    expect(result.map((r) => r.timeSlot)).toEqual(['08:00', '13:00', '20:00']);
    result.forEach((r) => expect(r.count).toBe(1));
  });

  // ── timeSlot 형식 ────────────────────────────────────────────────────────
  it('timeSlot 이 "HH:00" 형식으로 반환된다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: '2026-04-23T07:30:00' }),
      makeEvent({ status: 'missed', plannedAt: '2026-04-23T22:15:00' }),
    ];
    const result = calculateMissedPatterns(events);
    const slots = result.map((r) => r.timeSlot);

    expect(slots).toContain('07:00');
    expect(slots).toContain('22:00');
  });

  // ── taken/scheduled 는 무시 ────────────────────────────────────────────
  it('missed 가 아닌 상태는 패턴에 포함되지 않는다', () => {
    const events = [
      makeEvent({ status: 'taken',     plannedAt: '2026-04-23T08:00:00' }),
      makeEvent({ status: 'missed',    plannedAt: '2026-04-23T08:00:00' }),
      makeEvent({ status: 'late',      plannedAt: '2026-04-23T08:00:00' }),
      makeEvent({ status: 'scheduled', plannedAt: '2026-04-23T08:00:00' }),
    ];
    const result = calculateMissedPatterns(events);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });
});
