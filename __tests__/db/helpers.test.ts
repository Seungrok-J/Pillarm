import {
  dbInsert,
  dbUpsert,
  dbUpdate,
  dbSelectAll,
  dbSelectFirst,
  dbDelete,
} from '../../src/db/helpers';
import type { SQLiteDatabase } from 'expo-sqlite';

// expo-sqlite 는 네이티브 모듈이므로 타입만 사용하고 값은 mock 합니다.
jest.mock('expo-sqlite', () => ({}));

type MockDb = {
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function makeMock(): MockDb {
  return {
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };
}

// MockDb 를 SQLiteDatabase 로 캐스팅하는 헬퍼
const asDb = (m: MockDb) => m as unknown as SQLiteDatabase;

// ─── dbInsert ──────────────────────────────────────────────────────────────

describe('dbInsert', () => {
  it('올바른 INSERT SQL을 실행한다', async () => {
    const db = makeMock();
    await dbInsert(asDb(db), 'medications', {
      id: 'med-1',
      name: '혈압약',
      is_active: 1,
    });

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('INSERT INTO medications (id, name, is_active) VALUES (?, ?, ?)');
    expect(params).toEqual(['med-1', '혈압약', 1]);
  });

  it('null 값도 파라미터로 전달된다', async () => {
    const db = makeMock();
    await dbInsert(asDb(db), 'medications', { id: 'med-2', name: '비타민', color: null });

    const [, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(null);
  });
});

// ─── dbUpsert ─────────────────────────────────────────────────────────────

describe('dbUpsert', () => {
  it('ON CONFLICT … DO UPDATE SET 구문을 생성한다', async () => {
    const db = makeMock();
    await dbUpsert(
      asDb(db),
      'medications',
      { id: 'med-1', name: '혈압약', updated_at: '2026-04-22T00:00:00Z' },
      'id',
      ['name', 'updated_at'],
    );

    const [sql] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(sql).toContain('name = excluded.name');
    expect(sql).toContain('updated_at = excluded.updated_at');
  });

  it('삽입 값이 파라미터로 바인딩된다', async () => {
    const db = makeMock();
    await dbUpsert(
      asDb(db),
      'medications',
      { id: 'med-1', name: '혈압약' },
      'id',
      ['name'],
    );

    const [, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['med-1', '혈압약']);
  });
});

// ─── dbUpdate ─────────────────────────────────────────────────────────────

describe('dbUpdate', () => {
  it('SET 절과 WHERE 절이 모두 포함된 SQL을 실행한다', async () => {
    const db = makeMock();
    await dbUpdate(
      asDb(db),
      'dose_events',
      { status: 'taken', taken_at: '2026-04-22T08:03:00Z' },
      { sql: 'id = ?', params: ['evt-1'] },
    );

    const [sql, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('UPDATE dose_events SET status = ?, taken_at = ? WHERE id = ?');
    expect(params).toEqual(['taken', '2026-04-22T08:03:00Z', 'evt-1']);
  });

  it('여러 WHERE 파라미터를 지원한다', async () => {
    const db = makeMock();
    await dbUpdate(
      asDb(db),
      'dose_events',
      { status: 'missed' },
      { sql: 'schedule_id = ? AND status = ?', params: ['sched-1', 'scheduled'] },
    );

    const [sql, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE schedule_id = ? AND status = ?');
    expect(params).toEqual(['missed', 'sched-1', 'scheduled']);
  });
});

// ─── dbSelectAll ──────────────────────────────────────────────────────────

describe('dbSelectAll', () => {
  it('WHERE 없이 테이블 전체를 조회한다', async () => {
    const db = makeMock();
    db.getAllAsync.mockResolvedValue([{ id: 'med-1' }]);

    const result = await dbSelectAll(asDb(db), 'medications');

    const [sql, params] = db.getAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM medications');
    expect(params).toEqual([]);
    expect(result).toEqual([{ id: 'med-1' }]);
  });

  it('WHERE 조건을 포함한 SQL을 생성한다', async () => {
    const db = makeMock();
    await dbSelectAll(asDb(db), 'medications', {
      sql: 'is_active = ?',
      params: [1],
    });

    const [sql, params] = db.getAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM medications WHERE is_active = ?');
    expect(params).toEqual([1]);
  });

  it('ORDER BY 절이 SQL 끝에 추가된다', async () => {
    const db = makeMock();
    await dbSelectAll(asDb(db), 'dose_events', undefined, 'planned_at ASC');

    const [sql] = db.getAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM dose_events ORDER BY planned_at ASC');
  });

  it('WHERE와 ORDER BY를 함께 지원한다', async () => {
    const db = makeMock();
    await dbSelectAll(
      asDb(db),
      'dose_events',
      { sql: 'date(planned_at) = ?', params: ['2026-04-22'] },
      'planned_at ASC',
    );

    const [sql, params] = db.getAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(
      'SELECT * FROM dose_events WHERE date(planned_at) = ? ORDER BY planned_at ASC',
    );
    expect(params).toEqual(['2026-04-22']);
  });
});

// ─── dbSelectFirst ────────────────────────────────────────────────────────

describe('dbSelectFirst', () => {
  it('행이 없으면 null을 반환한다', async () => {
    const db = makeMock();
    db.getFirstAsync.mockResolvedValue(null);

    const result = await dbSelectFirst(asDb(db), 'user_settings', {
      sql: 'user_id = ?',
      params: ['local'],
    });

    expect(result).toBeNull();
  });

  it('행이 있으면 첫 번째 행을 반환한다', async () => {
    const db = makeMock();
    db.getFirstAsync.mockResolvedValue({ user_id: 'local', time_zone: 'Asia/Seoul' });

    const result = await dbSelectFirst<{ user_id: string; time_zone: string }>(
      asDb(db),
      'user_settings',
      { sql: 'user_id = ?', params: ['local'] },
    );

    expect(result).toEqual({ user_id: 'local', time_zone: 'Asia/Seoul' });
  });

  it('LIMIT 1을 포함한 SQL을 실행한다', async () => {
    const db = makeMock();
    await dbSelectFirst(asDb(db), 'medications', { sql: 'id = ?', params: ['med-1'] });

    const [sql] = db.getFirstAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM medications WHERE id = ? LIMIT 1');
  });
});

// ─── dbDelete ─────────────────────────────────────────────────────────────

describe('dbDelete', () => {
  it('DELETE FROM … WHERE SQL을 실행한다', async () => {
    const db = makeMock();
    await dbDelete(asDb(db), 'dose_events', {
      sql: 'schedule_id = ? AND status = ?',
      params: ['sched-1', 'scheduled'],
    });

    const [sql, params] = db.runAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(
      "DELETE FROM dose_events WHERE schedule_id = ? AND status = ?",
    );
    expect(params).toEqual(['sched-1', 'scheduled']);
  });
});
