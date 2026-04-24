export type Channel = 'push' | 'sound' | 'vibration';
export type QuietPolicy = 'delay' | 'keepSilent' | 'block';

export interface ReminderRule {
  id: string;
  scheduleId: string;
  baseReminder: string;
  repeatCount: number;
  repeatIntervalMinutes: number;
  channels: Channel[];
  quietHoursPolicy: QuietPolicy;
  createdAt: string;
  updatedAt: string;
}
