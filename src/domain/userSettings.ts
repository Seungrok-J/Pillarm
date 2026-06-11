export interface UserSettings {
  userId: 'local';
  timeZone: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  defaultSnoozeMinutes: number;
  maxSnoozeCount: number;
  missedToLateMinutes: number;
  autoMarkMissedEnabled: boolean;
  mealTimeBreakfast: string;
  mealTimeLunch: string;
  mealTimeDinner: string;
  /** 글씨 크기 배율 — 1.0(보통), 1.15(크게), 1.3(아주 크게) */
  fontScale: number;
}
