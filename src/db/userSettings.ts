import { getDatabase } from './database';
import { UserSettings } from '../domain';

const DEFAULTS: UserSettings = {
  userId: 'local',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  defaultSnoozeMinutes: 15,
  maxSnoozeCount: 3,
  missedToLateMinutes: 120,
  autoMarkMissedEnabled: true,
  mealTimeBreakfast: '09:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '17:00',
};

export async function getUserSettings(): Promise<UserSettings> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM user_settings WHERE user_id = ?',
    'local',
  );
  if (!row) {
    await saveUserSettings(DEFAULTS);
    return DEFAULTS;
  }
  return rowToSettings(row);
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO user_settings (user_id, time_zone, quiet_hours_start, quiet_hours_end, default_snooze_minutes, max_snooze_count, missed_to_late_minutes, auto_mark_missed_enabled, meal_time_breakfast, meal_time_lunch, meal_time_dinner)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       time_zone = excluded.time_zone,
       quiet_hours_start = excluded.quiet_hours_start,
       quiet_hours_end = excluded.quiet_hours_end,
       default_snooze_minutes = excluded.default_snooze_minutes,
       max_snooze_count = excluded.max_snooze_count,
       missed_to_late_minutes = excluded.missed_to_late_minutes,
       auto_mark_missed_enabled = excluded.auto_mark_missed_enabled,
       meal_time_breakfast = excluded.meal_time_breakfast,
       meal_time_lunch = excluded.meal_time_lunch,
       meal_time_dinner = excluded.meal_time_dinner`,
    settings.userId,
    settings.timeZone,
    settings.quietHoursStart ?? null,
    settings.quietHoursEnd ?? null,
    settings.defaultSnoozeMinutes,
    settings.maxSnoozeCount,
    settings.missedToLateMinutes,
    settings.autoMarkMissedEnabled ? 1 : 0,
    settings.mealTimeBreakfast,
    settings.mealTimeLunch,
    settings.mealTimeDinner,
  );
}

function rowToSettings(row: Record<string, unknown>): UserSettings {
  return {
    userId: 'local',
    timeZone: row['time_zone'] as string,
    quietHoursStart: row['quiet_hours_start'] as string | undefined,
    quietHoursEnd: row['quiet_hours_end'] as string | undefined,
    defaultSnoozeMinutes: row['default_snooze_minutes'] as number,
    maxSnoozeCount: row['max_snooze_count'] as number,
    missedToLateMinutes: row['missed_to_late_minutes'] as number,
    autoMarkMissedEnabled: (row['auto_mark_missed_enabled'] as number) === 1,
    mealTimeBreakfast: (row['meal_time_breakfast'] as string | null) ?? '09:00',
    mealTimeLunch:     (row['meal_time_lunch']     as string | null) ?? '12:00',
    mealTimeDinner:    (row['meal_time_dinner']    as string | null) ?? '17:00',
  };
}
