import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

// Promise 자체를 캐싱 — 단순히 `if (!_db)` 체크만 하면 getDatabase()가 거의 동시에
// 여러 번 호출됐을 때(앱 초기화 시 흔함) 둘 다 _db가 null인 걸 보고 openDatabaseAsync를
// 중복 호출하는 race condition이 생긴다. 웹(OPFS)에서는 같은 파일을 두 번 열려고 하면
// "Access Handles cannot be created..." 에러로 즉시 실패한다.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('pillarm.db');
      await runMigrations(db);
      return db;
    })();
  }
  return _dbPromise;
}
