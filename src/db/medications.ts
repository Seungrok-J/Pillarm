import { getDatabase } from './database';
import { Medication } from '../domain';

export async function getAllMedications(userId: string): Promise<Medication[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM medications WHERE is_active = 1 AND user_id = ? ORDER BY name',
    userId,
  );
  return rows.map(rowToMedication);
}

export async function upsertMedication(medication: Medication, userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO medications (id, name, dosage_value, dosage_unit, color, is_active, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       dosage_value = excluded.dosage_value,
       dosage_unit = excluded.dosage_unit,
       color = excluded.color,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    medication.id,
    medication.name,
    medication.dosageValue ?? null,
    medication.dosageUnit ?? null,
    medication.color ?? null,
    medication.isActive ? 1 : 0,
    userId,
    medication.createdAt,
    medication.updatedAt,
  );
}

export async function getMedicationById(id: string): Promise<Medication | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM medications WHERE id = ?',
    id,
  );
  return row ? rowToMedication(row) : null;
}

export async function deleteMedication(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE medications SET is_active = 0, updated_at = ? WHERE id = ?', new Date().toISOString(), id);
}

function rowToMedication(row: Record<string, unknown>): Medication {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    dosageValue: row['dosage_value'] as number | undefined,
    dosageUnit: row['dosage_unit'] as string | undefined,
    color: row['color'] as string | undefined,
    isActive: (row['is_active'] as number) === 1,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
