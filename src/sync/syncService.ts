import { Medication, Schedule, DoseEvent } from '../domain';
import { getAllMedications } from '../db/medications';
import { getAllSchedules } from '../db/schedules';
import { getDoseEventsByDateRange } from '../db/doseEvents';
import { api } from '../features/careCircle/careCircleApi';
import { useAuthStore } from '../store/authStore';
import { useMedicationStore } from '../store/medicationStore';

type DoseEventPayload = Omit<DoseEvent, 'photoPath'>;

function toDoseEventPayload(e: DoseEvent): DoseEventPayload {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { photoPath: _ignored, ...rest } = e;
  return rest;
}

export function isSyncEnabled(): boolean {
  return useAuthStore.getState().isLoggedIn;
}

/** 로그인 직후 로컬 데이터 전체를 서버로 업로드 */
export async function initialPush(userId: string): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [medications, schedules, doseEvents] = await Promise.all([
    getAllMedications(userId),
    getAllSchedules(userId),
    getDoseEventsByDateRange(since.toISOString(), new Date().toISOString(), userId),
  ]);

  if (!medications.length && !schedules.length && !doseEvents.length) return;

  await api.post('/sync/push', {
    medications,
    schedules,
    doseEvents: doseEvents.map(toDoseEventPayload),
  });
}

export async function pushMedication(medication: Medication): Promise<void> {
  await api.put(`/sync/medications/${medication.id}`, medication);
}

export async function pushSchedule(schedule: Schedule): Promise<void> {
  await api.put(`/sync/schedules/${schedule.id}`, schedule);
}

export async function pushDoseEvent(event: DoseEvent): Promise<void> {
  await api.put(`/sync/dose-events/${event.id}`, toDoseEventPayload(event));
}

/**
 * 오늘 복용 기록을 자신이 소유한 모든 보호 그룹에 스냅샷으로 업로드한다.
 * 보호자의 CareMonitorScreen이 이 데이터를 표시한다.
 */
export async function uploadTodaySnapshot(
  userId: string,
  todayEvents: DoseEvent[],
): Promise<void> {
  const medications = useMedicationStore.getState().medications;
  const medMap = new Map(medications.map((m) => [m.id, m.name]));

  const circles = await api
    .get<Array<{ id: string; ownerUserId: string }>>('/care-circles')
    .then((r) => r.data);
  const ownedCircles = circles.filter((c) => c.ownerUserId === userId);
  if (!ownedCircles.length) return;

  const events = todayEvents.map((e) => ({
    id:             e.id,
    medicationId:   e.medicationId,
    medicationName: medMap.get(e.medicationId),
    plannedAt:      e.plannedAt,
    takenAt:        e.takenAt,
    status:         e.status,
    note:           e.note,
  }));

  await Promise.allSettled(
    ownedCircles.map((c) =>
      api.put(`/care-circles/${c.id}/members/${userId}/today`, { events }),
    ),
  );
}
