import { getDatabase } from './database';
import { DoseEvent } from '../domain';

export async function getDoseEventsByDate(dateStr: string, userId: string): Promise<DoseEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM dose_events WHERE date(planned_at) = ? AND user_id = ? ORDER BY planned_at`,
    dateStr,
    userId,
  );
  return rows.map(rowToDoseEvent);
}

export async function updateDoseEventStatus(
  id: string,
  status: DoseEvent['status'],
  takenAt?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dose_events SET status = ?, taken_at = ?, updated_at = ? WHERE id = ?',
    status,
    takenAt ?? null,
    new Date().toISOString(),
    id,
  );
}

export async function insertDoseEvent(event: DoseEvent, userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO dose_events (id, schedule_id, medication_id, planned_at, status, taken_at, snooze_count, source, note, photo_path, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    event.scheduleId,
    event.medicationId,
    event.plannedAt,
    event.status,
    event.takenAt ?? null,
    event.snoozeCount,
    event.source,
    event.note ?? null,
    event.photoPath ?? null,
    userId,
    event.createdAt,
    event.updatedAt,
  );
}

export async function updateDoseEventMemo(
  id: string,
  note: string | null,
  photoPath: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dose_events SET note = ?, photo_path = ?, updated_at = ? WHERE id = ?',
    note,
    photoPath,
    new Date().toISOString(),
    id,
  );
}

export async function getDoseEventsByDateRange(
  startIso: string,
  endIso: string,
  userId: string,
): Promise<DoseEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dose_events WHERE planned_at >= ? AND planned_at < ? AND user_id = ? ORDER BY planned_at',
    startIso,
    endIso,
    userId,
  );
  return rows.map(rowToDoseEvent);
}

export async function updateDoseEventSnooze(
  id: string,
  snoozeCount: number,
  newPlannedAt: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dose_events SET snooze_count = ?, planned_at = ?, updated_at = ? WHERE id = ?',
    snoozeCount,
    newPlannedAt,
    new Date().toISOString(),
    id,
  );
}

/**
 * planned_at < nowIso 인 'scheduled' 이벤트를 'late' 로 전환합니다.
 * missed 처리 이후에 호출해야 grace period 초과분이 late 로 내려가지 않습니다.
 */
export async function markScheduledEventsLate(nowIso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE dose_events
        SET status = 'late', updated_at = ?
      WHERE status = 'scheduled' AND planned_at < ?`,
    new Date().toISOString(),
    nowIso,
  );
}

/**
 * planned_at < cutoffIso 인 'scheduled'/'late' 이벤트를 'missed' 로 전환합니다.
 * AppState active 전환 시 markScheduledEventsLate 보다 먼저 호출합니다.
 */
export async function markOverdueEventsMissed(cutoffIso: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE dose_events
        SET status = 'missed', updated_at = ?
      WHERE status IN ('scheduled', 'late') AND planned_at < ?`,
    new Date().toISOString(),
    cutoffIso,
  );
}

export async function deleteFutureDoseEvents(scheduleId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM dose_events WHERE schedule_id = ? AND planned_at >= ? AND status = 'scheduled'`,
    scheduleId,
    new Date().toISOString(),
  );
}

function rowToDoseEvent(row: Record<string, unknown>): DoseEvent {
  return {
    id: row['id'] as string,
    scheduleId: row['schedule_id'] as string,
    medicationId: row['medication_id'] as string,
    plannedAt: row['planned_at'] as string,
    status: row['status'] as DoseEvent['status'],
    takenAt: row['taken_at'] as string | undefined,
    snoozeCount: row['snooze_count'] as number,
    source: row['source'] as DoseEvent['source'],
    note: row['note'] as string | undefined,
    photoPath: row['photo_path'] as string | undefined,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
