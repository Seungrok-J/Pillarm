/**
 * runMigrations 단위 테스트
 *
 * 검증 항목:
 *   - 신규 설치: v1 + v2 모두 실행
 *   - Phase 1 → Phase 2 업데이트: v2만 실행
 *   - 최신 상태: 아무것도 재실행하지 않음 (멱등성)
 *   - schema_migrations 테이블 우선 생성 보장
 *   - MIGRATIONS 배열 내용(Phase 1 / Phase 2 분리) 정적 검증
 */

jest.mock('expo-sqlite', () => ({}));

import { runMigrations, MIGRATIONS } from '../../src/db/migrations';

// ── MockDb ─────────────────────────────────────────────────────────────────

type MockDb = {
  execAsync: jest.Mock;
  getAllAsync: jest.Mock;
  runAsync: jest.Mock;
};

function makeMock(): MockDb {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue(undefined),
  };
}

// expo-sqlite 타입은 런타임에 필요 없으므로 unknown 경유로 캐스팅
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (m: MockDb) => m as any;

// ── 테스트 ─────────────────────────────────────────────────────────────────

describe('runMigrations — 실행 흐름', () => {
  let db: MockDb;

  beforeEach(() => {
    db = makeMock();
  });

  // ── 신규 설치 ───────────────────────────────────────────────────────────

  describe('신규 설치 (적용된 마이그레이션 없음)', () => {
    beforeEach(() => {
      db.getAllAsync.mockResolvedValue([]);
    });

    it('schema_migrations 테이블을 가장 먼저 생성한다', async () => {
      await runMigrations(asDb(db));

      const firstSql = db.execAsync.mock.calls[0][0] as string;
      expect(firstSql).toContain('schema_migrations');
      expect(firstSql).toContain('CREATE TABLE IF NOT EXISTS');
    });

    it('v1, v2 마이그레이션을 순서대로 실행한다', async () => {
      await runMigrations(asDb(db));

      // schema_migrations 생성(1) + v1(2) + v2(3)
      expect(db.execAsync).toHaveBeenCalledTimes(3);
    });

    it('v1, v2 버전을 schema_migrations 에 기록한다', async () => {
      await runMigrations(asDb(db));

      expect(db.runAsync).toHaveBeenCalledTimes(2);
      expect((db.runAsync.mock.calls[0][1] as unknown[])).toContain(1);
      expect((db.runAsync.mock.calls[1][1] as unknown[])).toContain(2);
    });
  });

  // ── Phase 1 → Phase 2 업데이트 ──────────────────────────────────────────

  describe('v1만 적용된 상태 (Phase 1 → Phase 2 앱 업데이트)', () => {
    beforeEach(() => {
      db.getAllAsync.mockResolvedValue([{ version: 1 }]);
    });

    it('v2 마이그레이션만 실행한다', async () => {
      await runMigrations(asDb(db));

      // schema_migrations(1) + v2(2)
      expect(db.execAsync).toHaveBeenCalledTimes(2);
    });

    it('v2 버전만 schema_migrations 에 기록한다', async () => {
      await runMigrations(asDb(db));

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect((db.runAsync.mock.calls[0][1] as unknown[])).toContain(2);
    });

    it('v1 마이그레이션 SQL은 실행하지 않는다', async () => {
      await runMigrations(asDb(db));

      // execAsync 두 번째 호출(인덱스 1)이 v2여야 함
      const v2Sql = db.execAsync.mock.calls[1][0] as string;
      expect(v2Sql).toContain('medication_courses');
    });
  });

  // ── 최신 상태 (멱등성) ─────────────────────────────────────────────────

  describe('v1, v2 모두 적용된 상태 (최신 버전)', () => {
    beforeEach(() => {
      db.getAllAsync.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    });

    it('execAsync 를 schema_migrations 생성 1번만 호출한다', async () => {
      await runMigrations(asDb(db));

      expect(db.execAsync).toHaveBeenCalledTimes(1);
    });

    it('schema_migrations 에 새 레코드를 추가하지 않는다', async () => {
      await runMigrations(asDb(db));

      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('에러 없이 정상 완료된다', async () => {
      await expect(runMigrations(asDb(db))).resolves.toBeUndefined();
    });
  });

  // ── 두 번 연속 호출 (멱등성) ────────────────────────────────────────────

  describe('두 번 연속 호출 — 멱등성 보장', () => {
    it('첫 번째 호출 후 두 번째 호출은 아무것도 실행하지 않는다', async () => {
      // 1차 호출: 아무것도 적용 안 됨
      db.getAllAsync.mockResolvedValueOnce([]);
      // 2차 호출: 모두 적용됨 (1차가 기록했다고 가정)
      db.getAllAsync.mockResolvedValueOnce([{ version: 1 }, { version: 2 }]);

      await runMigrations(asDb(db));
      const runAsyncCountAfterFirst = db.runAsync.mock.calls.length;

      await runMigrations(asDb(db));
      const runAsyncCountAfterSecond = db.runAsync.mock.calls.length;

      expect(runAsyncCountAfterFirst).toBe(2);   // v1, v2 기록
      expect(runAsyncCountAfterSecond).toBe(2);  // 추가 기록 없음
    });

    it('두 번 호출해도 에러가 발생하지 않는다', async () => {
      db.getAllAsync.mockResolvedValue([{ version: 1 }, { version: 2 }]);

      await expect(runMigrations(asDb(db))).resolves.toBeUndefined();
      await expect(runMigrations(asDb(db))).resolves.toBeUndefined();
    });
  });
});

// ── MIGRATIONS 배열 정적 검증 ─────────────────────────────────────────────

describe('MIGRATIONS 배열 내용 검증', () => {
  it('v1 마이그레이션에 Phase 1 테이블 4개가 포함된다', () => {
    const v1 = MIGRATIONS.find((m) => m.version === 1);
    expect(v1).toBeDefined();
    expect(v1!.sql).toContain('CREATE TABLE IF NOT EXISTS medications');
    expect(v1!.sql).toContain('CREATE TABLE IF NOT EXISTS schedules');
    expect(v1!.sql).toContain('CREATE TABLE IF NOT EXISTS dose_events');
    expect(v1!.sql).toContain('CREATE TABLE IF NOT EXISTS user_settings');
  });

  it('v2 마이그레이션에 Phase 2 테이블 4개가 포함된다', () => {
    const v2 = MIGRATIONS.find((m) => m.version === 2);
    expect(v2).toBeDefined();
    expect(v2!.sql).toContain('CREATE TABLE IF NOT EXISTS medication_courses');
    expect(v2!.sql).toContain('CREATE TABLE IF NOT EXISTS medication_course_items');
    expect(v2!.sql).toContain('CREATE TABLE IF NOT EXISTS reminder_rules');
    expect(v2!.sql).toContain('CREATE TABLE IF NOT EXISTS point_ledger');
  });

  it('v2 마이그레이션에서 Phase 1 테이블을 새로 생성하지 않는다', () => {
    const v2 = MIGRATIONS.find((m) => m.version === 2)!;
    // REFERENCES medications(id) 같은 외래키 참조는 허용 → \b 단어 경계로 구분
    expect(v2.sql).not.toMatch(/CREATE TABLE IF NOT EXISTS medications\b/);
    expect(v2.sql).not.toMatch(/CREATE TABLE IF NOT EXISTS schedules\b/);
    expect(v2.sql).not.toMatch(/CREATE TABLE IF NOT EXISTS dose_events\b/);
    expect(v2.sql).not.toMatch(/CREATE TABLE IF NOT EXISTS user_settings\b/);
  });

  it('마이그레이션 버전이 오름차순으로 정의되어 있다', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    const sorted = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(sorted);
  });

  it('마이그레이션 버전에 중복이 없다', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });
});
