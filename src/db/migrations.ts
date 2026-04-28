type SQLiteBindValue = string | number | boolean | null | Uint8Array;

interface MigrationDb {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T[]>;
  runAsync(sql: string, params: SQLiteBindValue[]): Promise<unknown>;
}

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  // ── v1: Phase 1 MVP ─────────────────────────────────────────────────────────
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dosage_value REAL,
        dosage_unit TEXT,
        color TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        medication_id TEXT NOT NULL REFERENCES medications(id),
        schedule_type TEXT NOT NULL DEFAULT 'fixed',
        start_date TEXT NOT NULL,
        end_date TEXT,
        days_of_week TEXT,
        times TEXT NOT NULL,
        with_food TEXT NOT NULL DEFAULT 'none',
        grace_minutes INTEGER NOT NULL DEFAULT 120,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dose_events (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES schedules(id),
        medication_id TEXT NOT NULL REFERENCES medications(id),
        planned_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        taken_at TEXT,
        snooze_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY DEFAULT 'local',
        time_zone TEXT NOT NULL,
        quiet_hours_start TEXT,
        quiet_hours_end TEXT,
        default_snooze_minutes INTEGER NOT NULL DEFAULT 15,
        max_snooze_count INTEGER NOT NULL DEFAULT 3,
        missed_to_late_minutes INTEGER NOT NULL DEFAULT 120,
        auto_mark_missed_enabled INTEGER NOT NULL DEFAULT 1
      );
    `,
  },

  // ── v2: Phase 2 확장 기능 ────────────────────────────────────────────────────
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS medication_courses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        source TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS medication_course_items (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES medication_courses(id),
        medication_id TEXT NOT NULL REFERENCES medications(id),
        dose_per_intake_value REAL,
        dose_per_intake_unit TEXT,
        instructions TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reminder_rules (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES schedules(id),
        base_reminder TEXT NOT NULL,
        repeat_count INTEGER NOT NULL DEFAULT 0,
        repeat_interval_minutes INTEGER NOT NULL DEFAULT 15,
        channels TEXT NOT NULL DEFAULT '["push"]',
        quiet_hours_policy TEXT NOT NULL DEFAULT 'delay',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS point_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        delta INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        ref_id TEXT,
        created_at TEXT NOT NULL
      );
    `,
  },

  // ── v3: 복용 기록 사진 첨부 ───────────────────────────────────────────────────
  {
    version: 3,
    sql: `ALTER TABLE dose_events ADD COLUMN photo_path TEXT;`,
  },
];

export async function runMigrations(db: MigrationDb): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const applied = new Set(rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    await db.execAsync(migration.sql);
    await db.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [migration.version, new Date().toISOString()],
    );
  }
}
