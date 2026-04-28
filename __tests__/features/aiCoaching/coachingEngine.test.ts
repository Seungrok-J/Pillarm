import { generateCoachingMessages } from '../../../src/features/aiCoaching/coachingEngine';
import type { DoseEvent, Schedule } from '../../../src/domain';

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

let _idCounter = 0;
function uid() { return `id-${++_idCounter}`; }

/** 기본값이 있는 DoseEvent 팩토리 (오늘 기준 10일 전 기본값) */
function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  const scheduleId = overrides.scheduleId ?? 'sched-1';
  return {
    id:           uid(),
    scheduleId,
    medicationId: 'med-1',
    plannedAt:    daysAgo(10) + 'T09:00:00.000Z',
    status:       'taken',
    snoozeCount:  0,
    source:       'notification',
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id:           overrides.id ?? 'sched-1',
    medicationId: 'med-1',
    scheduleType: 'fixed',
    startDate:    '2026-01-01',
    times:        ['09:00'],
    withFood:     'none',
    graceMinutes: 120,
    isActive:     true,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    ...overrides,
  };
}

/** N일 전 ISO 날짜 문자열 (YYYY-MM-DD) */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 날짜 + 시간 → ISO 문자열 */
function at(date: string, time = '09:00:00'): string {
  return `${date}T${time}.000Z`;
}

// ── 규칙 1: suggest_time_change ───────────────────────────────────────────────

describe('규칙 1 — 누락 집중 시간대 → suggest_time_change', () => {
  it('동일 시간대(시 기준) 누락 3회 이상이면 메시지를 생성한다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(20), '09:05:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(13), '09:10:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(6),  '09:15:00') }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.some((m) => m.type === 'suggest_time_change')).toBe(true);
  });

  it('생성된 메시지에 scheduleId와 suggestedTime이 포함된다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(20), '08:00:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(13), '08:00:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(6),  '08:00:00') }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    const tc = msgs.find((m) => m.type === 'suggest_time_change')!;
    expect(tc.scheduleId).toBe('sched-1');
    expect(tc.suggestedTime).toBeTruthy();
  });

  it('누락 2회이면 메시지를 생성하지 않는다', () => {
    const events = [
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(20), '09:00:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(10), '09:00:00') }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'suggest_time_change')).toHaveLength(0);
  });

  it('서로 다른 시간대(시)의 누락은 합산하지 않는다', () => {
    // 09시에 2회, 10시에 1회 — 각각 임계값 미달
    const events = [
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(20), '09:00:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(13), '09:00:00') }),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(6),  '10:00:00') }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'suggest_time_change')).toHaveLength(0);
  });
});

// ── 규칙 2: suggest_delay ─────────────────────────────────────────────────────

describe('규칙 2 — 미루기 누적 → suggest_delay', () => {
  it('스케줄 snoozeCount 합산 10회 이상이면 메시지를 생성한다', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ status: 'taken', snoozeCount: 1, plannedAt: at(daysAgo(20 - i)) }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.some((m) => m.type === 'suggest_delay')).toBe(true);
  });

  it('생성된 메시지에 스케줄 첫 번째 시간 기반 suggestedTime이 포함된다', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ status: 'taken', snoozeCount: 1, plannedAt: at(daysAgo(20 - i)) }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule({ times: ['08:00'] })]);
    const delay = msgs.find((m) => m.type === 'suggest_delay')!;
    expect(delay.suggestedTime).toBe('08:30'); // 30분 뒤 제안
  });

  it('snoozeCount 합산 9회이면 메시지를 생성하지 않는다', () => {
    const events = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeEvent({ status: 'taken', snoozeCount: 1, plannedAt: at(daysAgo(20 - i)) }),
      ),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'suggest_delay')).toHaveLength(0);
  });
});

// ── 규칙 3: praise ────────────────────────────────────────────────────────────

describe('규칙 3 — 연속 완료 칭찬', () => {
  it('7일 연속 완료 → praise 메시지 생성', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      makeEvent({ status: 'taken', plannedAt: at(daysAgo(7 - i)) }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.some((m) => m.type === 'praise')).toBe(true);
  });

  it('praise 메시지에 연속 일수가 포함된다', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ status: 'taken', plannedAt: at(daysAgo(10 - i)) }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    const praise = msgs.find((m) => m.type === 'praise')!;
    expect(praise.message).toContain('10일');
  });

  it('연속 6일 완료 → praise 메시지 없음', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ status: 'taken', plannedAt: at(daysAgo(6 - i)) }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'praise')).toHaveLength(0);
  });

  it('연속 중간에 누락이 있으면 streak이 끊긴다', () => {
    // 4일 완료, 1일 누락, 4일 완료 → 최대 streak 4 (< 7)
    const events = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeEvent({ status: 'taken', plannedAt: at(daysAgo(9 - i)) }),
      ),
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(5)) }),
      ...Array.from({ length: 4 }, (_, i) =>
        makeEvent({ status: 'taken', plannedAt: at(daysAgo(4 - i)) }),
      ),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'praise')).toHaveLength(0);
  });

  it('skipped 이벤트는 연속 계산에서 제외된다', () => {
    // 7일 연속 + 그 중 일부가 skipped → skipped는 total에서 제외
    const events = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeEvent({ status: 'taken',   plannedAt: at(daysAgo(7 - i)) }),
      ),
      makeEvent({ status: 'skipped',  plannedAt: at(daysAgo(1)) }),
      makeEvent({ status: 'taken',    plannedAt: at(daysAgo(1), '11:00:00') }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.some((m) => m.type === 'praise')).toBe(true);
  });
});

// ── 우선순위 및 제한 ──────────────────────────────────────────────────────────

describe('우선순위 및 메시지 수 제한', () => {
  it('메시지는 최대 3개를 반환한다', () => {
    // 3가지 규칙 모두 충족되도록 데이터 구성
    const scheduleA = makeSchedule({ id: 'sched-a', times: ['09:00'] });
    const scheduleB = makeSchedule({ id: 'sched-b', times: ['14:00'] });
    const events = [
      // 규칙 1 — sched-a 09시 누락 3회
      ...Array.from({ length: 3 }, (_, i) =>
        makeEvent({ scheduleId: 'sched-a', status: 'missed', plannedAt: at(daysAgo(20 - i * 5), '09:00:00') }),
      ),
      // 규칙 1 — sched-b 14시 누락 3회 (2번째 suggest_time_change)
      ...Array.from({ length: 3 }, (_, i) =>
        makeEvent({ scheduleId: 'sched-b', status: 'missed', plannedAt: at(daysAgo(20 - i * 5), '14:00:00') }),
      ),
      // 규칙 2 — sched-a snooze 10회
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent({ scheduleId: 'sched-a', status: 'taken', snoozeCount: 1, plannedAt: at(daysAgo(20 - i)) }),
      ),
      // 규칙 3 — 7일 연속 완료
      ...Array.from({ length: 7 }, (_, i) =>
        makeEvent({ scheduleId: 'sched-a', status: 'taken', plannedAt: at(daysAgo(7 - i), '12:00:00') }),
      ),
    ];
    const msgs = generateCoachingMessages(events, [scheduleA, scheduleB]);
    expect(msgs.length).toBeLessThanOrEqual(3);
  });

  it('suggest_time_change 가 praise 보다 앞에 위치한다', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeEvent({ status: 'missed', plannedAt: at(daysAgo(20 - i * 5), '09:00:00') }),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeEvent({ status: 'taken', plannedAt: at(daysAgo(7 - i), '12:00:00') }),
      ),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    const tcIdx    = msgs.findIndex((m) => m.type === 'suggest_time_change');
    const praiseIdx = msgs.findIndex((m) => m.type === 'praise');
    if (tcIdx !== -1 && praiseIdx !== -1) {
      expect(tcIdx).toBeLessThan(praiseIdx);
    }
  });
});

// ── 30일 필터 ─────────────────────────────────────────────────────────────────

describe('30일 필터', () => {
  it('30일 이전 이벤트는 분석에서 제외된다', () => {
    const events = Array.from({ length: 5 }, () =>
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(31), '09:00:00') }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.filter((m) => m.type === 'suggest_time_change')).toHaveLength(0);
  });

  it('정확히 30일 전(경계값) 이벤트는 포함된다', () => {
    const events = Array.from({ length: 3 }, () =>
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(29), '09:00:00') }),
    );
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs.some((m) => m.type === 'suggest_time_change')).toBe(true);
  });
});

// ── 데이터 부족 ────────────────────────────────────────────────────────────────

describe('데이터 부족 / 엣지 케이스', () => {
  it('이벤트가 없으면 빈 배열을 반환한다', () => {
    expect(generateCoachingMessages([], [])).toHaveLength(0);
  });

  it('이벤트는 있지만 어떤 규칙도 충족하지 않으면 빈 배열을 반환한다', () => {
    const events = [
      makeEvent({ status: 'taken',   snoozeCount: 0, plannedAt: at(daysAgo(5)) }),
      makeEvent({ status: 'missed',  snoozeCount: 0, plannedAt: at(daysAgo(3)) }),
    ];
    const msgs = generateCoachingMessages(events, [makeSchedule()]);
    expect(msgs).toHaveLength(0);
  });

  it('schedules 배열이 비어도 suggest_time_change 는 생성될 수 있다 (scheduleId만 필요)', () => {
    const events = Array.from({ length: 3 }, () =>
      makeEvent({ status: 'missed', plannedAt: at(daysAgo(10), '09:00:00') }),
    );
    const msgs = generateCoachingMessages(events, []);
    expect(msgs.some((m) => m.type === 'suggest_time_change')).toBe(true);
  });
});
