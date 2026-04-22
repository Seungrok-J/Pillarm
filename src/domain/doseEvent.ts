export type DoseStatus = 'scheduled' | 'taken' | 'late' | 'missed' | 'skipped';
export type DoseSource = 'notification' | 'manual';

export interface DoseEvent {
  id: string;
  scheduleId: string;
  medicationId: string;
  plannedAt: string;
  status: DoseStatus;
  takenAt?: string;
  snoozeCount: number;
  source: DoseSource;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
