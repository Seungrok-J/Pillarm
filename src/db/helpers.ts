import type { SQLiteDatabase } from 'expo-sqlite';

/** snake_case 컬럼 값 타입 */
export type BindValue = string | number | null;

/** WHERE 절 구조체. sql에 WHERE 키워드 포함하지 않음 */
export interface WhereClause {
  sql: string;
  params: BindValue[];
}

/**
 * 단일 행 INSERT
 * row 키가 컬럼명, 값이 바인딩 값으로 사용됩니다.
 */
export async function dbInsert(
  db: SQLiteDatabase,
  table: string,
  row: Record<string, BindValue>,
): Promise<void> {
  const cols = Object.keys(row).join(', ');
  const placeholders = Object.keys(row).map(() => '?').join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
    Object.values(row),
  );
}

/**
 * INSERT … ON CONFLICT(conflictTarget) DO UPDATE SET updateCols
 * 새 행을 삽입하거나, 충돌 시 지정 컬럼만 업데이트합니다.
 */
export async function dbUpsert(
  db: SQLiteDatabase,
  table: string,
  row: Record<string, BindValue>,
  conflictTarget: string,
  updateCols: string[],
): Promise<void> {
  const cols = Object.keys(row).join(', ');
  const placeholders = Object.keys(row).map(() => '?').join(', ');
  const updateSet = updateCols.map((c) => `${c} = excluded.${c}`).join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateSet}`,
    Object.values(row),
  );
}

/**
 * WHERE 조건을 만족하는 행들의 컬럼을 업데이트합니다.
 */
export async function dbUpdate(
  db: SQLiteDatabase,
  table: string,
  row: Record<string, BindValue>,
  where: WhereClause,
): Promise<void> {
  const setClauses = Object.keys(row)
    .map((k) => `${k} = ?`)
    .join(', ');
  await db.runAsync(
    `UPDATE ${table} SET ${setClauses} WHERE ${where.sql}`,
    [...Object.values(row), ...where.params],
  );
}

/**
 * 테이블에서 조건을 만족하는 모든 행을 반환합니다.
 * where, orderBy는 선택적입니다.
 */
export async function dbSelectAll<T>(
  db: SQLiteDatabase,
  table: string,
  where?: WhereClause,
  orderBy?: string,
): Promise<T[]> {
  let sql = `SELECT * FROM ${table}`;
  const params: BindValue[] = [];
  if (where) {
    sql += ` WHERE ${where.sql}`;
    params.push(...where.params);
  }
  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }
  return db.getAllAsync<T>(sql, params);
}

/**
 * 조건을 만족하는 첫 번째 행을 반환합니다. 없으면 null.
 */
export async function dbSelectFirst<T>(
  db: SQLiteDatabase,
  table: string,
  where: WhereClause,
): Promise<T | null> {
  const result = await db.getFirstAsync<T>(
    `SELECT * FROM ${table} WHERE ${where.sql} LIMIT 1`,
    where.params,
  );
  return result ?? null;
}

/**
 * WHERE 조건을 만족하는 행들을 삭제합니다.
 */
export async function dbDelete(
  db: SQLiteDatabase,
  table: string,
  where: WhereClause,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM ${table} WHERE ${where.sql}`,
    where.params,
  );
}
