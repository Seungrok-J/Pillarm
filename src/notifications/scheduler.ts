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
} from '../db';
import { useAuthStore } from '../store/authStore';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

// ── 스케줄링 ──────────────────────────────────────────────────────────────

/**
 * 스케줄에 해당하는 알림과 DoseEvent 를 오늘~30일치 등록합니다.
 * 기존 등록된 알림은 먼저 모두 취소합니다.
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

  for (let d = new Date(todayMidnight); d <= limitDate; d = addMinutes(d, 24 * 60)) {
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(d.getDay())) continue;

    for (const timeStr of schedule.times) {
      const [hours, minutes] = timeStr.split(':').map(Number) as [number, number];

      const plannedAt = new Date(d);
      plannedAt.setHours(hours, minutes, 0, 0);

      // 이미 지난 시간은 등록하지 않습니다.
      if (plannedAt <= now) continue;

      const triggerAt = adjustForQuietHours(plannedAt, settings);
      const doseEventId = generateId();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${medication.name} 복용 시간이에요 💊`,
          body: withFoodBody(schedule.withFood),
          data: {
            scheduleId: schedule.id,
            medicationId: medication.id,
            doseEventId,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerAt,
        },
      });

      await insertDoseEvent({
        id: doseEventId,
        scheduleId: schedule.id,
        medicationId: medication.id,
        plannedAt: toLocalISOString(plannedAt),
        status: 'scheduled',
        snoozeCount: 0,
        source: 'notification',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, currentUserId());
    }
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

  await Notifications.scheduleNotificationAsync({
    content: existing
      ? (existing.content as unknown as Notifications.NotificationContentInput)
      : { title: '약 복용 시간이에요 💊', body: '복용할 시간입니다', data: { doseEventId } },
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
