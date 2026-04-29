import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DoseEvent, UserSettings } from '../domain';
import { updateDoseEventStatus } from '../db';
import { addMinutes } from '../utils/date';
import { generateId } from '../utils';

export async function snoozeDoseEvent(
  event: DoseEvent,
  settings: UserSettings,
): Promise<DoseEvent | null> {
  if (Platform.OS === 'web') return null;
  if (event.snoozeCount >= settings.maxSnoozeCount) return null;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.find(
    (n) => (n.content.data as Record<string, unknown>)?.['doseEventId'] === event.id,
  );
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing.identifier);
  }

  const snoozeAt = addMinutes(new Date(), settings.defaultSnoozeMinutes);

  await Notifications.scheduleNotificationAsync({
    content: (existing
      ? { ...existing.content, data: { ...((existing.content.data as Record<string, unknown>) ?? {}), doseEventId: event.id } }
      : { title: '약 복용 시간이에요 💊', body: '복용할 시간입니다', data: { doseEventId: event.id } }
    ) as unknown as Notifications.NotificationContentInput,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: snoozeAt },
  });

  const updated: DoseEvent = {
    ...event,
    snoozeCount: event.snoozeCount + 1,
    updatedAt: new Date().toISOString(),
  };

  await updateDoseEventStatus(event.id, event.status);
  return updated;
}
