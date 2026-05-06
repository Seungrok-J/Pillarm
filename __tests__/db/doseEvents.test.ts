jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));

import {
  getDoseEventsByDate,
  getDoseEventsByDateRange,
  insertDoseEvent,
  updateDoseEventStatus,
  updateDoseEventMemo,
  updateDoseEventSnooze,
  markOverdueEventsMissed,
  deleteFutureDoseEvents,
} from '../../src/db/doseEvents';
import { getDatabase } from '../../src/db/database';
import type { DoseEvent } from '../../src/domain';

const mockGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

function makeMockDb(overrides: Record<string, jest.Mock> = {}) {
  return {
    getAllAsync:   jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync:     jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (m: ReturnType<typeof makeMockDb>) => m as any;

const BASE_EVENT: DoseEvent = {
  id: 'evt-1',
  scheduleId: 'sch-1',
  medicationId: 'med-1',
  plannedAt: '2025-01-01T08:00:00.000Z',
  status: 'scheduled',
  takenAt: undefined,
  snoozeCount: 0,
  source: 'scheduled',
  note: undefined,
  photoPath: undefined,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const BASE_ROW: Record<string, unknown> = {
  id: 'evt-1',
  schedule_id: 'sch-1',
  medication_id: 'med-1',
  planned_at: '2025-01-01T08:00:00.000Z',
  status: 'scheduled',
  taken_at: null,
  snooze_count: 0,
  source: 'scheduled',
  note: null,
  photo_path: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

describe('doseEvents DB', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(db));
  });

  // ── getDoseEventsByDate ───────────────────────────────────────────────────

  describe('getDoseEventsByDate', () => {
    it('날짜별 이벤트를 반환한다', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const result = await getDoseEventsByDate('2025-01-01');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('evt-1');
      expect(result[0].status).toBe('scheduled');
    });

    it('date() 필터로 쿼리한다', async () => {
      await getDoseEventsByDate('2025-01-01');
      expect(db.getAllAsync.mock.calls[0][0]).toContain('date(planned_at)');
    });

    it('photo_path 와 note 가 null 이면 falsy 값 반환', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const [r] = await getDoseEventsByDate('2025-01-01');
      expect(r.photoPath).toBeFalsy();
      expect(r.note).toBeFalsy();
    });

    it('photo_path 가 있으면 photoPath 에 매핑된다', async () => {
      db.getAllAsync.mockResolvedValue([{ ...BASE_ROW, photo_path: 'file:///test.jpg', note: '메모' }]);
      const [r] = await getDoseEventsByDate('2025-01-01');
      expect(r.photoPath).toBe('file:///test.jpg');
      expect(r.note).toBe('메모');
    });
  });

  // ── getDoseEventsByDateRange ──────────────────────────────────────────────

  describe('getDoseEventsByDateRange', () => {
    it('기간별 이벤트를 반환한다', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const result = await getDoseEventsByDateRange('2025-01-01T00:00:00.000Z', '2025-01-08T00:00:00.000Z');
      expect(result).toHaveLength(1);
    });

    it('planned_at 범위로 쿼리한다', async () => {
      await getDoseEventsByDateRange('2025-01-01T00:00:00.000Z', '2025-01-08T00:00:00.000Z');
      const sql = db.getAllAsync.mock.calls[0][0] as string;
      expect(sql).toContain('planned_at >= ?');
      expect(sql).toContain('planned_at < ?');
    });
  });

  // ── insertDoseEvent ───────────────────────────────────────────────────────

  describe('insertDoseEvent', () => {
    it('INSERT 쿼리를 실행한다', async () => {
      await insertDoseEvent(BASE_EVENT);
      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect(db.runAsync.mock.calls[0][0]).toContain('INSERT INTO dose_events');
    });

    it('photo_path 파라미터를 포함한다', async () => {
      await insertDoseEvent({ ...BASE_EVENT, photoPath: 'file:///photo.jpg' });
      expect(db.runAsync.mock.calls[0]).toContain('file:///photo.jpg');
    });

    it('optional 필드가 없으면 null 전달', async () => {
      await insertDoseEvent(BASE_EVENT);
      const params = db.runAsync.mock.calls[0];
      expect(params).toContain(null); // takenAt, note, photo_path
    });
  });

  // ── updateDoseEventStatus ─────────────────────────────────────────────────

  describe('updateDoseEventStatus', () => {
    it('status 와 taken_at 을 업데이트한다', async () => {
      await updateDoseEventStatus('evt-1', 'taken', '2025-01-01T08:05:00.000Z');
      expect(db.runAsync.mock.calls[0][0]).toContain('SET status = ?');
      expect(db.runAsync.mock.calls[0]).toContain('evt-1');
      expect(db.runAsync.mock.calls[0]).toContain('taken');
    });

    it('takenAt 없으면 null 전달', async () => {
      await updateDoseEventStatus('evt-1', 'missed');
      expect(db.runAsync.mock.calls[0]).toContain(null);
    });
  });

  // ── updateDoseEventMemo ───────────────────────────────────────────────────

  describe('updateDoseEventMemo', () => {
    it('note 와 photo_path 를 업데이트한다', async () => {
      await updateDoseEventMemo('evt-1', '메모', 'file:///photo.jpg');
      expect(db.runAsync.mock.calls[0][0]).toContain('SET note = ?');
      expect(db.runAsync.mock.calls[0]).toContain('evt-1');
    });

    it('null 값을 그대로 전달한다', async () => {
      await updateDoseEventMemo('evt-1', null, null);
      const params = db.runAsync.mock.calls[0];
      expect(params).toContain(null);
    });
  });

  // ── updateDoseEventSnooze ─────────────────────────────────────────────────

  describe('updateDoseEventSnooze', () => {
    it('snooze_count 를 업데이트한다', async () => {
      await updateDoseEventSnooze('evt-1', 2);
      expect(db.runAsync.mock.calls[0][0]).toContain('snooze_count = ?');
      expect(db.runAsync.mock.calls[0]).toContain(2);
    });
  });

  // ── markOverdueEventsMissed ───────────────────────────────────────────────

  describe('markOverdueEventsMissed', () => {
    it("status='scheduled' 이면서 planned_at < cutoff 인 이벤트를 missed 처리한다", async () => {
      await markOverdueEventsMissed('2025-01-01T09:00:00.000Z');
      const sql = db.runAsync.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'missed'");
      expect(sql).toContain("status IN ('scheduled', 'late')");
    });
  });

  // ── deleteFutureDoseEvents ────────────────────────────────────────────────

  describe('deleteFutureDoseEvents', () => {
    it('스케줄의 미래 scheduled 이벤트를 삭제한다', async () => {
      await deleteFutureDoseEvents('sch-1');
      const sql = db.runAsync.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM dose_events');
      expect(db.runAsync.mock.calls[0]).toContain('sch-1');
    });
  });
});
