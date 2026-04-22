export type ScheduleType = 'fixed' | 'interval' | 'asNeeded';
export type WithFood = 'before' | 'after' | 'none';

export interface Schedule {
  id: string;
  medicationId: string;
  scheduleType: ScheduleType;
  startDate: string;
  endDate?: string;
  daysOfWeek?: number[];
  times: string[];
  withFood: WithFood;
  graceMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
