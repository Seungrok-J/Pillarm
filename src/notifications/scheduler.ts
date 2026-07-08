import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Schedule, Medication, UserSettings } from '../domain';
import { generateId } from '../utils';
import { addMinutes } from '../utils/date';
import { isInQuietHours, adjustForQuietHours } from './quietHours';
import {
  insertDoseEvent,
  markOverdueEventsMissed,
  markScheduledEventsLate,
  getAllSchedules,
  getMedicationById,
  getDatabase,
} from '../db';
import { useAuthStore } from '../store/authStore';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

// iOS 는 앱당 예약 로컬 알림을 64개까지만 유지하고 초과분을 조용히 버린다.
// 스누즈 재등록 여유분을 남기고, 가까운 시각 순으로 이 예산 안에서만 등록한다.
// 예산에서 밀려난 미래 이벤트는 앱 복귀 시 topUpNotifications 로 보충된다.
const MAX_SCHEDULED_NOTIFICATIONS = 60;

interface NotificationCandidate {
  content: Notifications.NotificationContentInput;
  triggerAt: Date;
}

// ── 스케줄링 ──────────────────────────────────────────────────────────────

/**
 * 스케줄에 해당하는 DoseEvent 를 오늘~30일치 생성하고,
 * 알림은 전역 예산(MAX_SCHEDULED_NOTIFICATIONS) 안에서 가까운 시각 순으로 등록합니다.
 * 기존 등록된 이 스케줄의 알림은 먼저 모두 취소합니다.
 */
export async function scheduleForSchedule(
  schedule: Schedule,
  medication: Medication,
  settings: UserSettings,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelForSchedule(schedule.id);

  const now = new Date();
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const thirtyDaysLater = addMinutes(todayMidnight, 30 * 24 * 60);
  const limitDate = schedule.endDate
    ? new Date(Math.min(new Date(schedule.endDate).getTime(), thirtyDaysLater.getTime()))
    : thirtyDaysLater;

  const db = await getDatabase();
  const candidates: NotificationCandidate[] = [];

  for (let d = new Date(todayMidnight); d <= limitDate; d = addMinutes(d, 24 * 60)) {
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(d.getDay())) continue;

    for (const timeStr of schedule.times) {
      const [hours, minutes] = timeStr.split(':').map(Number) as [number, number];

      const plannedAt = new Date(d);
      plannedAt.setHours(hours, minutes, 0, 0);

      // 이미 지난 시간은 등록하지 않습니다.
      if (plannedAt <= now) continue;

      const plannedAtStr = toLocalISOString(plannedAt);
      const existing = await db.getFirstAsync<{ id: string; status: string }>(
        'SELECT id, status FROM dose_events WHERE schedule_id = ? AND planned_at = ?',
        schedule.id,
        plannedAtStr,
      );
      // 이미 taken/skipped 등으로 처리된 이벤트는 알림도 만들지 않습니다.
      if (existing && existing.status !== 'scheduled') continue;

      const doseEventId = existing?.id ?? generateId();
      const triggerAt = adjustForQuietHours(plannedAt, settings);

      candidates.push({
        content: {
          title: `${medication.name} 복용 시간이에요 💊`,
          body: withFoodBody(schedule.withFood),
          data: {
            scheduleId: schedule.id,
            medicationId: medication.id,
            doseEventId,
            userId: currentUserId(),
            triggerAt: triggerAt.getTime(),
          },
        },
        triggerAt,
      });

      if (!existing) {
        await insertDoseEvent({
          id: doseEventId,
          scheduleId: schedule.id,
          medicationId: medication.id,
          plannedAt: plannedAtStr,
          status: 'scheduled',
          snoozeCount: 0,
          source: 'notification',
          packetId: schedule.packetId,
          packetName: schedule.packetName,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }, currentUserId());
      }
    }
  }

  await registerWithinBudget(candidates);
}

/**
 * 전역 알림 예산을 유지하면서 후보 알림을 등록합니다.
 * 기존 예약 알림과 후보를 시각 순으로 합쳐 가까운 60개만 남기고,
 * 예산에서 밀려난 기존 알림은 취소합니다(가까운 시각 우선 불변식 유지).
 */
async function registerWithinBudget(candidates: NotificationCandidate[]): Promise<void> {
  if (!candidates.length) return;
  const existing = await Notifications.getAllScheduledNotificationsAsync();

  type Entry = {
    triggerAt: number;
    identifier?: string;
    candidate?: NotificationCandidate;
  };

  const entries: Entry[] = [
    ...existing.map((n) => {
      const data = n.content.data as Record<string, unknown> | undefined;
      const trigger = n.trigger as unknown as Record<string, unknown> | null;
      // 구버전 알림에는 data.triggerAt 이 없을 수 있다 — trigger 정보로 폴백,
      // 그래도 없으면 0(가장 가까운 것) 취급해 취소 대상이 되지 않게 한다.
      const triggerAt =
        Number(data?.['triggerAt'] ?? trigger?.['value'] ?? Date.parse(String(trigger?.['date'] ?? '')) ?? 0) || 0;
      return { identifier: n.identifier, triggerAt };
    }),
    ...candidates.map((c) => ({ candidate: c, triggerAt: c.triggerAt.getTime() })),
  ];
  entries.sort((a, b) => a.triggerAt - b.triggerAt);

  const keep = entries.slice(0, MAX_SCHEDULED_NOTIFICATIONS);
  const drop = entries.slice(MAX_SCHEDULED_NOTIFICATIONS);

  await Promise.all(
    drop
      .filter((e) => e.identifier)
      .map((e) => Notifications.cancelScheduledNotificationAsync(e.identifier!)),
  );

  for (const e of keep) {
    if (!e.candidate) continue;
    await Notifications.scheduleNotificationAsync({
      content: e.candidate.content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: e.candidate.triggerAt,
      },
    });
  }
}

/**
 * 알림 예산에 여유가 생겼을 때(알림 발화·시간 경과), 알림이 등록되지 않은
 * 미래의 scheduled 이벤트를 가까운 시각 순으로 보충 등록합니다.
 * App 이 active 로 전환될 때 checkAndMarkMissed 이후에 호출합니다.
 */
export async function topUpNotifications(settings: UserSettings): Promise<void> {
  if (Platform.OS === 'web') return;

  const all = await Notifications.getAllScheduledNotificationsAsync();
  let budget = MAX_SCHEDULED_NOTIFICATIONS - all.length;
  if (budget <= 0) return;

  const registered = new Set(
    all.map((n) => (n.content.data as Record<string, unknown>)?.['doseEventId']),
  );

  const db = await getDatabase();
  const userId = currentUserId();
  const rows = await db.getAllAsync<{
    id: string;
    schedule_id: string;
    medication_id: string;
    planned_at: string;
  }>(
    `SELECT id, schedule_id, medication_id, planned_at FROM dose_events
      WHERE user_id = ? AND status = 'scheduled' AND planned_at > ?
      ORDER BY planned_at ASC LIMIT ?`,
    userId,
    toLocalISOString(new Date()),
    MAX_SCHEDULED_NOTIFICATIONS,
  );
  if (!rows.length) return;

  const schedules = await getAllSchedules(userId);
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));
  const medCache = new Map<string, Medication | null>();

  for (const row of rows) {
    if (budget <= 0) break;
    if (registered.has(row.id)) continue;

    const schedule = scheduleMap.get(row.schedule_id);
    if (!schedule) continue;

    if (!medCache.has(row.medication_id)) {
      medCache.set(row.medication_id, await getMedicationById(row.medication_id));
    }
    const med = medCache.get(row.medication_id);
    if (!med) continue;

    const triggerAt = adjustForQuietHours(new Date(row.planned_at), settings);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${med.name} 복용 시간이에요 💊`,
        body: withFoodBody(schedule.withFood),
        data: {
          scheduleId: schedule.id,
          medicationId: med.id,
          doseEventId: row.id,
          userId,
          triggerAt: triggerAt.getTime(),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
      },
    });
    budget--;
  }
}

// ── 취소 ──────────────────────────────────────────────────────────────────

/**
 * 특정 doseEventId 에 연결된 예약 알림 1건을 취소합니다.
 * markTaken 호출 시 복용 전 알림을 제거하는 용도로 사용합니다.
 */
export async function cancelNotificationForDoseEvent(doseEventId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const target = all.find(
    (n) => (n.content.data as Record<string, unknown>)?.['doseEventId'] === doseEventId,
  );
  if (target) {
    await Notifications.cancelScheduledNotificationAsync(target.identifier);
  }
}

/**
 * 특정 scheduleId 에 연결된 등록된 알림을 모두 취소합니다.
 */
export async function cancelForSchedule(scheduleId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = all.filter(
    (n) => (n.content.data as Record<string, unknown>)?.['scheduleId'] === scheduleId,
  );
  await Promise.all(
    toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ── 미루기 ────────────────────────────────────────────────────────────────

/**
 * 특정 DoseEvent 에 연결된 기존 알림을 취소하고,
 * snoozeMinutes 후로 새 알림을 등록합니다.
 */
export async function rescheduleSnooze(
  doseEventId: string,
  snoozeMinutes: number,
  basePlannedAt: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const existing = all.find(
    (n) => (n.content.data as Record<string, unknown>)?.['doseEventId'] === doseEventId,
  );

  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing.identifier);
  }

  const snoozeAt = addMinutes(new Date(basePlannedAt), snoozeMinutes);

  const content: Notifications.NotificationContentInput = existing
    ? {
        ...(existing.content as unknown as Notifications.NotificationContentInput),
        data: {
          ...(existing.content.data as Record<string, unknown>),
          triggerAt: snoozeAt.getTime(),
        },
      }
    : {
        title: '약 복용 시간이에요 💊',
        body: '복용할 시간입니다',
        data: { doseEventId, triggerAt: snoozeAt.getTime() },
      };

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeAt,
    },
  });
}

// ── 전체 재스케줄링 ───────────────────────────────────────────────────────

/**
 * 조용한 시간 변경 등으로 UserSettings 가 바뀔 때 모든 활성 스케줄을
 * 새 설정 기준으로 재등록합니다.
 */
export async function rescheduleAllSchedules(settings: UserSettings): Promise<void> {
  const schedules = await getAllSchedules(currentUserId());
  const medCache = new Map<string, Medication | null>();

  for (const schedule of schedules) {
    if (!medCache.has(schedule.medicationId)) {
      medCache.set(schedule.medicationId, await getMedicationById(schedule.medicationId));
    }
    const med = medCache.get(schedule.medicationId);
    if (med) await scheduleForSchedule(schedule, med, settings);
  }
}

// ── 누락 자동 처리 ────────────────────────────────────────────────────────

/**
 * AppState 가 active 로 전환될 때 호출합니다.
 * 1) plannedAt + missedToLateMinutes 초과 → 'missed'
 * 2) plannedAt 지남 but grace period 이내 → 'late'
 */
export async function checkAndMarkMissed(settings: UserSettings): Promise<void> {
  const now = toLocalISOString(new Date());
  const cutoff = toLocalISOString(
    new Date(Date.now() - settings.missedToLateMinutes * 60_000),
  );
  await markOverdueEventsMissed(cutoff);
  await markScheduledEventsLate(now);
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

/** 로컬 시각 기준 ISO-8601 문자열 (YYYY-MM-DDTHH:mm:ss, UTC 오프셋 없음) */
function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function withFoodBody(withFood: Schedule['withFood']): string {
  if (withFood === 'before') return '식전에 복용하세요';
  if (withFood === 'after') return '식후에 복용하세요';
  return '복용할 시간입니다';
}
