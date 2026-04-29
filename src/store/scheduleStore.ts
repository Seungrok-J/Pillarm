import { create } from 'zustand';
import { Schedule } from '../domain';
import {
  getSchedulesByMedication,
  getAllSchedules,
  upsertSchedule,
  deleteSchedule,
} from '../db';
import { cancelForSchedule } from '../notifications';
import { useAuthStore } from './authStore';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface ScheduleState {
  schedules: Schedule[];
  isLoading: boolean;
  error: string | null;
  fetchSchedules: (medicationId: string) => Promise<void>;
  addSchedule: (schedule: Schedule) => Promise<void>;
  updateSchedule: (schedule: Schedule) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  isLoading: false,
  error: null,

  fetchSchedules: async (medicationId) => {
    set({ isLoading: true, error: null });
    try {
      const schedules = await getSchedulesByMedication(medicationId, currentUserId());
      set({ schedules, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  addSchedule: async (schedule) => {
    set({ error: null });
    try {
      await upsertSchedule(schedule, currentUserId());
      set((state) => ({ schedules: [...state.schedules, schedule] }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  updateSchedule: async (schedule) => {
    set({ error: null });
    const prev = get().schedules;
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === schedule.id ? schedule : s,
      ),
    }));
    try {
      await upsertSchedule(schedule, currentUserId());
    } catch (e) {
      set({ schedules: prev, error: (e as Error).message });
      throw e;
    }
  },

  deleteSchedule: async (id) => {
    set({ error: null });
    const prev = get().schedules;
    set((state) => ({
      schedules: state.schedules.filter((s) => s.id !== id),
    }));
    try {
      await cancelForSchedule(id);
      await deleteSchedule(id);
    } catch (e) {
      set({ schedules: prev, error: (e as Error).message });
      throw e;
    }
  },
}));
