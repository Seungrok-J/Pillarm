import * as SQLite from 'expo-sqlite';

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
  `);
}
