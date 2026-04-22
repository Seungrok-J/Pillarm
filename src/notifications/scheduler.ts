import * as Notifications from 'expo-notifications';
import { Schedule, Medication, DoseEvent, UserSettings } from '../domain';
import { generateId } from '../utils';
import { insertDoseEvent } from '../db';
import { isInQuietHours, addMinutes, toDateString } from '../utils/date';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelScheduleNotifications(scheduleId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(
    (n) => (n.content.data as Record<string, unknown>)?.['scheduleId'] === scheduleId,
  );
  await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleNotificationsForSchedule(
  schedule: Schedule,
  medication: Medication,
  settings: UserSettings,
): Promise<void> {
  await cancelScheduleNotifications(schedule.id);

  const today = new Date();
  const endDate = schedule.endDate
    ? new Date(schedule.endDate)
    : addMinutes(today, 30 * 24 * 60);

  const limit = new Date(Math.min(endDate.getTime(), addMinutes(today, 30 * 24 * 60).getTime()));

  for (let d = new Date(today); d <= limit; d = addMinutes(d, 24 * 60)) {
    const dayOfWeek = d.getDay();
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(dayOfWeek)) continue;

    for (const timeStr of schedule.times) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const plannedAt = new Date(d);
      plannedAt.setHours(hours!, minutes!, 0, 0);
      if (plannedAt < today) continue;

      let triggerAt = plannedAt;
      if (isInQuietHours(plannedAt, settings.quietHoursStart, settings.quietHoursEnd)) {
        const [endH, endM] = (settings.quietHoursEnd ?? '07:00').split(':').map(Number);
        triggerAt = new Date(plannedAt);
        triggerAt.setHours(endH!, endM!, 0, 0);
      }

      const withFoodText =
        medication ? (schedule.withFood === 'before' ? '식전에 복용하세요' : schedule.withFood === 'after' ? '식후에 복용하세요' : '') : '';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${medication.name} 복용 시간이에요 💊`,
          body: withFoodText || '복용할 시간입니다',
          data: { scheduleId: schedule.id, doseEventId: generateId(), medicationId: medication.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerAt },
      });

      const event: DoseEvent = {
        id: generateId(),
        scheduleId: schedule.id,
        medicationId: medication.id,
        plannedAt: plannedAt.toISOString(),
        status: 'scheduled',
        snoozeCount: 0,
        source: 'notification',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await insertDoseEvent(event);
    }
  }
}
