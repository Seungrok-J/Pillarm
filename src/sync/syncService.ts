import { Medication, Schedule, DoseEvent } from '../domain';
import { getAllMedications, upsertMedication } from '../db/medications';
import { getAllSchedules, upsertSchedule } from '../db/schedules';
import { getDoseEventsByDateRange, upsertDoseEvent } from '../db/doseEvents';
import { api } from '../features/careCircle/careCircleApi';
import { useAuthStore } from '../store/authStore';
import { useNetworkStore } from '../store/networkStore';
import { useMedicationStore } from '../store/medicationStore';
import { todayString } from '../utils';

type DoseEventPayload = Omit<DoseEvent, 'photoPath'>;

function toDoseEventPayload(e: DoseEvent): DoseEventPayload {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { photoPath: _ignored, ...rest } = e;
  return rest;
}

export function isSyncEnabled(): boolean {
  return useAuthStore.getState().isLoggedIn;
}

/**
 * 재연결 시 호출 — pending 플래그가 있으면 initialPush 재시도.
 * App.tsx의 NetInfo 리스너에서 isOnline 전환 시 호출한다.
 */
export async function retrySyncIfPending(): Promise<void> {
  const { isLoggedIn, userId } = useAuthStore.getState();
  const { hasPendingSync, clearPendingSync } = useNetworkStore.getState();
  if (!isLoggedIn || !userId || !hasPendingSync) return;
  try {
    await initialPush(userId);
    await clearPendingSync();
  } catch {
    // 여전히 실패하면 pending 유지
  }
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

  try {
    await api.post('/sync/push', {
      medications,
      schedules,
      doseEvents: doseEvents.map(toDoseEventPayload),
    });
  } catch (err) {
    // 오프라인이거나 서버 오류 → pending 마킹 후 재연결 시 재시도
    await useNetworkStore.getState().markPendingSync();
    throw err;
  }
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
 * 서버에서 데이터를 풀다운하여 로컬 SQLite에 upsert합니다.
 * 기기 교체·재설치 후 로그인 시 호출하면 서버 데이터가 복원됩니다.
 */
export async function pullFromServer(userId: string): Promise<void> {
  const { data } = await api.get<{
    medications: Medication[];
    schedules:   Schedule[];
    doseEvents:  DoseEventPayload[];
  }>('/sync/pull');

  await Promise.all([
    ...data.medications.map((m) => upsertMedication(m, userId)),
    ...data.schedules.map((s)   => upsertSchedule(s, userId)),
    ...data.doseEvents.map((e)  => upsertDoseEvent(e, userId)),
  ]);
}

export async function uploadTodaySnapshot(
  userId: string,
  todayEvents: DoseEvent[],
): Promise<void> {
  const medications = useMedicationStore.getState().medications;
  const medMap = new Map(medications.map((m) => [m.id, m.name]));

  const circles = await api
    .get<Array<{ id: string; ownerUserId: string }>>('/care-circles')
    .then((r) => r.data);
  // GET /care-circles는 본인이 owner이거나 member인 그룹만 반환한다.
  // 피보호자는 그룹의 owner가 아니라 member이므로, owner가 아닌 그룹에 스냅샷을 올려야 한다.
  const memberCircles = circles.filter((c) => c.ownerUserId !== userId);
  if (!memberCircles.length) return;

  const events = todayEvents.map((e) => ({
    id:             e.id,
    medicationId:   e.medicationId,
    medicationName: medMap.get(e.medicationId),
    plannedAt:      e.plannedAt,
    takenAt:        e.takenAt,
    status:         e.status,
    note:           e.note,
  }));

  const date = todayString(); // 클라이언트 로컬 날짜 (한국 시간 기준)
  await Promise.allSettled(
    memberCircles.map((c) =>
      api.put(`/care-circles/${c.id}/members/${userId}/today`, { date, events }),
    ),
  );
}
