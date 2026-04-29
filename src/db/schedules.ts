import { getDatabase } from './database';
import { Schedule } from '../domain';

export async function getSchedulesByMedication(medicationId: string, userId: string): Promise<Schedule[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM schedules WHERE medication_id = ? AND is_active = 1 AND user_id = ?',
    medicationId,
    userId,
  );
  return rows.map(rowToSchedule);
}

export async function upsertSchedule(schedule: Schedule, userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO schedules (id, medication_id, schedule_type, start_date, end_date, days_of_week, times, with_food, grace_minutes, is_active, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       schedule_type = excluded.schedule_type,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       days_of_week = excluded.days_of_week,
       times = excluded.times,
       with_food = excluded.with_food,
       grace_minutes = excluded.grace_minutes,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    schedule.id,
    schedule.medicationId,
    schedule.scheduleType,
    schedule.startDate,
    schedule.endDate ?? null,
    schedule.daysOfWeek ? JSON.stringify(schedule.daysOfWeek) : null,
    JSON.stringify(schedule.times),
    schedule.withFood,
    schedule.graceMinutes,
    schedule.isActive ? 1 : 0,
    userId,
    schedule.createdAt,
    schedule.updatedAt,
  );
}

export async function getScheduleById(id: string): Promise<Schedule | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM schedules WHERE id = ?',
    id,
  );
  return row ? rowToSchedule(row) : null;
}

export async function getAllSchedules(userId: string): Promise<Schedule[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM schedules WHERE is_active = 1 AND user_id = ? ORDER BY created_at',
    userId,
  );
  return rows.map(rowToSchedule);
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE schedules SET is_active = 0, updated_at = ? WHERE id = ?',
    new Date().toISOString(),
    id,
  );
}

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row['id'] as string,
    medicationId: row['medication_id'] as string,
    scheduleType: row['schedule_type'] as Schedule['scheduleType'],
    startDate: row['start_date'] as string,
    endDate: row['end_date'] as string | undefined,
    daysOfWeek: row['days_of_week'] ? (JSON.parse(row['days_of_week'] as string) as number[]) : undefined,
    times: JSON.parse(row['times'] as string) as string[],
    withFood: row['with_food'] as Schedule['withFood'],
    graceMinutes: row['grace_minutes'] as number,
    isActive: (row['is_active'] as number) === 1,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
