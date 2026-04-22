import { create } from 'zustand';
import { Schedule } from '../domain';
import { getSchedulesByMedication, upsertSchedule } from '../db';

interface ScheduleState {
  schedules: Schedule[];
  loadSchedules: (medicationId: string) => Promise<void>;
  addOrUpdateSchedule: (schedule: Schedule) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],

  loadSchedules: async (medicationId) => {
    const schedules = await getSchedulesByMedication(medicationId);
    set({ schedules });
  },

  addOrUpdateSchedule: async (schedule) => {
    await upsertSchedule(schedule);
    set((state) => {
      const exists = state.schedules.some((s) => s.id === schedule.id);
      const schedules = exists
        ? state.schedules.map((s) => (s.id === schedule.id ? schedule : s))
        : [...state.schedules, schedule];
      return { schedules };
    });
  },
}));
