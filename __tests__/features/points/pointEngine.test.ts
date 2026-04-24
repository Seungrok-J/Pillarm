/**
 * pointEngine 단위 테스트
 *
 * - awardDoseTaken: 신뢰 범위, 중복 방지, 잔액 계산
 * - awardStreakBonus: streak 7배수 판정, 중복 방지
 * - awardPerfectWeek: 완벽한 주 판정, 중복 방지
 * - spendPoints: 잔액 충분/부족
 * - getBalance / getHistory: DB 조회 결과 매핑
 */

jest.mock('../../../src/db', () => ({
  getDatabase: jest.fn(),
  getDoseEventsByDateRange: jest.fn(),
}));

jest.mock('../../../src/utils', () => ({
  generateId: jest.fn(() => 'gen-id'),
}));

jest.mock('../../../src/features/points/streakCalculator', () => ({
  getCurrentStreak: jest.fn(),
  isPerfectWeek:    jest.fn(),
}));

import * as db           from '../../../src/db';
import * as streakCalc   from '../../../src/features/points/streakCalculator';
import {
  awardDoseTaken,
  awardStreakBonus,
  awardPerfectWeek,
  spendPoints,
  getBalance,
  getHistory,
} from '../../../src/features/points/pointEngine';
import type { DoseEvent } from '../../../src/domain';

// ── mock 참조 ────────────────────────────────────────────────────────────────

const mockGetDatabase              = db.getDatabase as jest.Mock;
const mockGetDoseEventsByDateRange = db.getDoseEventsByDateRange as jest.Mock;
const mockGetCurrentStreak         = streakCalc.getCurrentStreak as jest.Mock;
const mockIsPerfectWeek            = streakCalc.isPerfectWeek as jest.Mock;

const mockDb = {
  getFirstAsync: jest.fn(),
  getAllAsync:    jest.fn(),
  runAsync:      jest.fn(),
};

// ── 초기화 ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockResolvedValue(mockDb);
  mockDb.runAsync.mockResolvedValue(undefined);
  mockGetDoseEventsByDateRange.mockResolvedValue([]);
});

// ── 픽스처 ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id:           'evt-1',
    scheduleId:   'sched-1',
    medicationId: 'med-1',
    plannedAt:    '2026-04-24T08:00:00',
    status:       'taken',
    takenAt:      '2026-04-24T08:05:00', // 5분 후 — 기본 신뢰 범위 내
    snoozeCount:  0,
    source:       'notification',
    createdAt:    '2026-04-24T00:00:00Z',
    updatedAt:    '2026-04-24T08:05:00Z',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// awardDoseTaken
// ═══════════════════════════════════════════════════════════════════════════════

describe('awardDoseTaken', () => {
  it('신뢰 범위 내 복용 → +10 적립, refId = doseEvent.id', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)              // dup check: 없음
      .mockResolvedValueOnce({ balance: 50 });  // 잔액

    const result = await awardDoseTaken(makeEvent(), 120);

    expect(result).not.toBeNull();
    expect(result!.delta).toBe(10);
    expect(result!.balance).toBe(60);
    expect(result!.reason).toBe('dose_taken');
    expect(result!.refId).toBe('evt-1');
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it('takenAt 없으면 null 반환, DB 호출 없음', async () => {
    const result = await awardDoseTaken(makeEvent({ takenAt: undefined }), 120);

    expect(result).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('graceMinutes 초과 → null (너무 늦은 복용)', async () => {
    // plannedAt 08:00 + grace 60min = 09:00 마감, takenAt 10:00
    const result = await awardDoseTaken(
      makeEvent({ takenAt: '2026-04-24T10:00:00' }),
      60,
    );
    expect(result).toBeNull();
  });

  it('plannedAt - 30분 이전 → null (너무 이른 복용)', async () => {
    // plannedAt 08:00 - 30min = 07:30 한계, takenAt 07:25
    const result = await awardDoseTaken(
      makeEvent({ takenAt: '2026-04-24T07:25:00' }),
      120,
    );
    expect(result).toBeNull();
  });

  it('이미 적립된 이벤트 → null, INSERT 없음 (멱등성)', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 'dup-entry' });

    const result = await awardDoseTaken(makeEvent(), 120);

    expect(result).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('잔액 0에서 첫 복용 → balance = 10', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)  // dup: 없음
      .mockResolvedValueOnce(null); // balance: 없음(null) → 0

    const result = await awardDoseTaken(makeEvent(), 120);

    expect(result!.balance).toBe(10);
  });

  it('plannedAt - 30분 정확히 → 범위 포함 (경계값)', async () => {
    // plannedAt 08:00, takenAt 07:30 (정확히 -30분)
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ balance: 0 });

    const result = await awardDoseTaken(
      makeEvent({ takenAt: '2026-04-24T07:30:00' }),
      120,
    );
    expect(result).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// awardStreakBonus
// ═══════════════════════════════════════════════════════════════════════════════

describe('awardStreakBonus', () => {
  it('streak = 7 → +50 적립', async () => {
    mockGetCurrentStreak.mockReturnValue(7);
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)             // dup: 없음
      .mockResolvedValueOnce({ balance: 60 }); // 잔액

    const result = await awardStreakBonus('local');

    expect(result!.delta).toBe(50);
    expect(result!.balance).toBe(110);
    expect(result!.reason).toBe('streak_7days');
  });

  it('streak = 14 → +50 적립 (7의 배수)', async () => {
    mockGetCurrentStreak.mockReturnValue(14);
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ balance: 110 });

    const result = await awardStreakBonus('local');

    expect(result).not.toBeNull();
    expect(result!.delta).toBe(50);
  });

  it('streak = 5 → null (7의 배수 아님)', async () => {
    mockGetCurrentStreak.mockReturnValue(5);

    const result = await awardStreakBonus('local');

    expect(result).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('streak = 0 → null', async () => {
    mockGetCurrentStreak.mockReturnValue(0);

    const result = await awardStreakBonus('local');

    expect(result).toBeNull();
  });

  it('최근 7일 내 이미 적립됨 → null (중복 방지)', async () => {
    mockGetCurrentStreak.mockReturnValue(7);
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 'dup' }); // dup 발견

    const result = await awardStreakBonus('local');

    expect(result).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// awardPerfectWeek
// ═══════════════════════════════════════════════════════════════════════════════

describe('awardPerfectWeek', () => {
  it('완벽한 주 → +30 적립', async () => {
    mockIsPerfectWeek.mockReturnValue(true);
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)             // dup: 없음
      .mockResolvedValueOnce({ balance: 10 }); // 잔액

    const result = await awardPerfectWeek('local');

    expect(result!.delta).toBe(30);
    expect(result!.reason).toBe('perfect_week');
    expect(result!.balance).toBe(40);
  });

  it('누락 있음 → null', async () => {
    mockIsPerfectWeek.mockReturnValue(false);

    const result = await awardPerfectWeek('local');

    expect(result).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('이번 주 이미 적립됨 → null (중복 방지)', async () => {
    mockIsPerfectWeek.mockReturnValue(true);
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 'dup' });

    const result = await awardPerfectWeek('local');

    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// spendPoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('spendPoints', () => {
  it('잔액 충분 → 차감 후 true, INSERT 호출', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ balance: 200 });

    const result = await spendPoints('local', 100, 'theme_purchase');

    expect(result).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    // INSERT SQL 에 음수 delta 포함 확인
    const params = mockDb.runAsync.mock.calls[0] as unknown[];
    expect(params).toContainEqual(-100);
  });

  it('잔액 부족 → false, INSERT 없음', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ balance: 30 });

    const result = await spendPoints('local', 100, 'theme_purchase');

    expect(result).toBe(false);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('잔액 = amount → 정확히 0까지 차감 가능', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ balance: 50 });

    const result = await spendPoints('local', 50, 'badge_unlock');

    expect(result).toBe(true);
  });

  it('차감 후 balance = 현재잔액 - amount', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ balance: 200 });

    await spendPoints('local', 100, 'theme_purchase');

    // runAsync 의 첫 번째 호출에서 balance 파라미터가 100 인지 확인
    const params = mockDb.runAsync.mock.calls[0] as unknown[];
    expect(params).toContainEqual(100); // balance = 200 - 100
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getBalance
// ═══════════════════════════════════════════════════════════════════════════════

describe('getBalance', () => {
  it('최신 잔액을 반환한다', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ balance: 150 });

    const balance = await getBalance('local');

    expect(balance).toBe(150);
  });

  it('이력 없으면 0 반환', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const balance = await getBalance('local');

    expect(balance).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getHistory
// ═══════════════════════════════════════════════════════════════════════════════

describe('getHistory', () => {
  it('DB row 를 camelCase PointLedger 배열로 변환한다', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id:         'entry-1',
        user_id:    'local',
        reason:     'dose_taken',
        delta:      10,
        balance:    10,
        ref_id:     'evt-1',
        created_at: '2026-04-24T08:05:00Z',
      },
    ]);

    const history = await getHistory('local');

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id:      'entry-1',
      userId:  'local',
      reason:  'dose_taken',
      delta:   10,
      balance: 10,
      refId:   'evt-1',
    });
  });

  it('ref_id 가 null 이면 refId 는 undefined', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: 'e2', user_id: 'local', reason: 'streak_7days',
        delta: 50, balance: 60, ref_id: null, created_at: '2026-04-24T00:00:00Z',
      },
    ]);

    const [entry] = await getHistory('local');
    expect(entry!.refId).toBeUndefined();
  });

  it('빈 이력이면 빈 배열 반환', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const history = await getHistory('local');
    expect(history).toEqual([]);
  });
});
