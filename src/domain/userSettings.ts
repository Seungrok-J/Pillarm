export interface UserSettings {
  userId: 'local';
  timeZone: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  defaultSnoozeMinutes: number;
  maxSnoozeCount: number;
  missedToLateMinutes: number;
  autoMarkMissedEnabled: boolean;
}
