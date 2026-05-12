jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));

import {
  getSchedulesByMedication,
  upsertSchedule,
  getScheduleById,
  getAllSchedules,
  deleteSchedule,
} from '../../src/db/schedules';
import { getDatabase } from '../../src/db/database';
import type { Schedule } from '../../src/domain';

const mockGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

function makeMockDb() {
  return {
    getAllAsync:   jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync:     jest.fn().mockResolvedValue(undefined),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (m: ReturnType<typeof makeMockDb>) => m as any;

const BASE_SCHEDULE: Schedule = {
  id: 'sch-1',
  medicationId: 'med-1',
  scheduleType: 'fixed',
  startDate: '2025-01-01',
  endDate: undefined,
  daysOfWeek: undefined,
  times: ['08:00', '20:00'],
  withFood: 'after',
  graceMinutes: 30,
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const BASE_ROW: Record<string, unknown> = {
  id: 'sch-1',
  medication_id: 'med-1',
  schedule_type: 'fixed',
  start_date: '2025-01-01',
  end_date: null,
  days_of_week: null,
  times: '["08:00","20:00"]',
  with_food: 'after',
  grace_minutes: 30,
  is_active: 1,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

describe('schedules DB', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(db));
  });

  // ── getSchedulesByMedication ──────────────────────────────────────────────

  describe('getSchedulesByMedication', () => {
    it('약 ID로 스케줄 목록을 반환한다', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const result = await getSchedulesByMedication('med-1', 'local');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sch-1');
      expect(result[0].times).toEqual(['08:00', '20:00']);
    });

    it('없으면 빈 배열 반환', async () => {
      const result = await getSchedulesByMedication('unknown', 'local');
      expect(result).toEqual([]);
    });

    it('medication_id 로 필터링한다', async () => {
      await getSchedulesByMedication('med-1', 'local');
      expect(db.getAllAsync.mock.calls[0]).toContain('med-1');
    });

    it('daysOfWeek 가 있으면 JSON.parse 된다', async () => {
      db.getAllAsync.mockResolvedValue([{ ...BASE_ROW, days_of_week: '[1,3,5]' }]);
      const [r] = await getSchedulesByMedication('med-1', 'local');
      expect(r.daysOfWeek).toEqual([1, 3, 5]);
    });
  });

  // ── upsertSchedule ────────────────────────────────────────────────────────

  describe('upsertSchedule', () => {
    it('INSERT OR UPDATE 쿼리를 실행한다', async () => {
      await upsertSchedule(BASE_SCHEDULE, 'local');
      expect(db.runAsync.mock.calls[0][0]).toContain('ON CONFLICT(id) DO UPDATE SET');
    });

    it('times 를 JSON 문자열로 전달한다', async () => {
      await upsertSchedule(BASE_SCHEDULE, 'local');
      expect(db.runAsync.mock.calls[0]).toContain(JSON.stringify(['08:00', '20:00']));
    });

    it('isActive=false 이면 0 전달', async () => {
      await upsertSchedule({ ...BASE_SCHEDULE, isActive: false }, 'local');
      expect(db.runAsync.mock.calls[0]).toContain(0);
    });

    it('endDate 없으면 null 전달', async () => {
      await upsertSchedule(BASE_SCHEDULE, 'local');
      expect(db.runAsync.mock.calls[0]).toContain(null);
    });

    it('daysOfWeek 있으면 JSON 문자열로 전달한다', async () => {
      await upsertSchedule({ ...BASE_SCHEDULE, daysOfWeek: [1, 3, 5] }, 'local');
      expect(db.runAsync.mock.calls[0]).toContain(JSON.stringify([1, 3, 5]));
    });
  });

  // ── getScheduleById ───────────────────────────────────────────────────────

  describe('getScheduleById', () => {
    it('row 가 있으면 Schedule 을 반환한다', async () => {
      db.getFirstAsync.mockResolvedValue(BASE_ROW);
      const result = await getScheduleById('sch-1');
      expect(result).not.toBeNull();
      expect(result!.medicationId).toBe('med-1');
    });

    it('row 가 없으면 null 반환', async () => {
      const result = await getScheduleById('unknown');
      expect(result).toBeNull();
    });
  });

  // ── getAllSchedules ───────────────────────────────────────────────────────

  describe('getAllSchedules', () => {
    it('모든 active 스케줄을 반환한다', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const result = await getAllSchedules('local');
      expect(result).toHaveLength(1);
    });

    it('is_active=1 조건으로 쿼리한다', async () => {
      await getAllSchedules('local');
      expect(db.getAllAsync.mock.calls[0][0]).toContain('is_active = 1');
    });
  });

  // ── deleteSchedule ────────────────────────────────────────────────────────

  describe('deleteSchedule', () => {
    it('is_active=0 으로 소프트 삭제한다', async () => {
      await deleteSchedule('sch-1');
      expect(db.runAsync.mock.calls[0][0]).toContain('is_active = 0');
      expect(db.runAsync.mock.calls[0]).toContain('sch-1');
    });
  });
});
