import { getDatabase } from './database';
import { DoseEvent } from '../domain';

export async function getDoseEventsByDate(dateStr: string): Promise<DoseEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    \`SELECT * FROM dose_events WHERE date(planned_at) = ? ORDER BY planned_at\`,
    dateStr,
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

export async function insertDoseEvent(event: DoseEvent): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    \`INSERT INTO dose_events (id, schedule_id, medication_id, planned_at, status, taken_at, snooze_count, source, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
    event.id,
    event.scheduleId,
    event.medicationId,
    event.plannedAt,
    event.status,
    event.takenAt ?? null,
    event.snoozeCount,
    event.source,
    event.note ?? null,
    event.createdAt,
    event.updatedAt,
  );
}

export async function deleteFutureDoseEvents(scheduleId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    \`DELETE FROM dose_events WHERE schedule_id = ? AND planned_at >= ? AND status = 'scheduled'\`,
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
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
