jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));

import { getAllMedications, upsertMedication, getMedicationById, deleteMedication } from '../../src/db/medications';
import { getDatabase } from '../../src/db/database';
import type { Medication } from '../../src/domain';

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

const BASE_MED: Medication = {
  id: 'med-1',
  name: '이부프로펜정',
  dosageValue: 400,
  dosageUnit: 'mg',
  color: '#3b82f6',
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const BASE_ROW: Record<string, unknown> = {
  id: 'med-1',
  name: '이부프로펜정',
  dosage_value: 400,
  dosage_unit: 'mg',
  color: '#3b82f6',
  is_active: 1,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

describe('medications DB', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(db));
  });

  // ── getAllMedications ──────────────────────────────────────────────────────

  describe('getAllMedications', () => {
    it('active 약 목록을 반환한다', async () => {
      db.getAllAsync.mockResolvedValue([BASE_ROW]);
      const result = await getAllMedications();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('med-1');
      expect(result[0].name).toBe('이부프로펜정');
      expect(result[0].isActive).toBe(true);
    });

    it('약이 없으면 빈 배열 반환', async () => {
      const result = await getAllMedications();
      expect(result).toEqual([]);
    });

    it('is_active=1 필터로 쿼리한다', async () => {
      await getAllMedications();
      expect(db.getAllAsync.mock.calls[0][0]).toContain('is_active = 1');
    });

    it('dosageValue/dosageUnit null 인 경우 falsy 값 반환', async () => {
      db.getAllAsync.mockResolvedValue([{ ...BASE_ROW, dosage_value: null, dosage_unit: null }]);
      const [r] = await getAllMedications();
      expect(r.dosageValue).toBeFalsy();
      expect(r.dosageUnit).toBeFalsy();
    });
  });

  // ── upsertMedication ──────────────────────────────────────────────────────

  describe('upsertMedication', () => {
    it('INSERT OR UPDATE 쿼리를 실행한다', async () => {
      await upsertMedication(BASE_MED);
      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect(db.runAsync.mock.calls[0][0]).toContain('ON CONFLICT(id) DO UPDATE SET');
    });

    it('isActive=false 이면 0을 전달한다', async () => {
      await upsertMedication({ ...BASE_MED, isActive: false });
      const params = db.runAsync.mock.calls[0];
      expect(params).toContain(0);
    });

    it('dosageValue/dosageUnit 없으면 null 전달', async () => {
      const med: Medication = { ...BASE_MED, dosageValue: undefined, dosageUnit: undefined };
      await upsertMedication(med);
      const params = db.runAsync.mock.calls[0];
      expect(params).toContain(null);
    });
  });

  // ── getMedicationById ─────────────────────────────────────────────────────

  describe('getMedicationById', () => {
    it('row 가 있으면 Medication 을 반환한다', async () => {
      db.getFirstAsync.mockResolvedValue(BASE_ROW);
      const result = await getMedicationById('med-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('med-1');
    });

    it('row 가 없으면 null 반환', async () => {
      const result = await getMedicationById('unknown');
      expect(result).toBeNull();
    });
  });

  // ── deleteMedication ──────────────────────────────────────────────────────

  describe('deleteMedication', () => {
    it('is_active=0 으로 소프트 삭제한다', async () => {
      await deleteMedication('med-1');
      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect(db.runAsync.mock.calls[0][0]).toContain('is_active = 0');
      expect(db.runAsync.mock.calls[0]).toContain('med-1');
    });
  });
});
