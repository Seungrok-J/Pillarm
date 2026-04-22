import { create } from 'zustand';
import { DoseEvent } from '../domain';
import { getDoseEventsByDate, updateDoseEventStatus, insertDoseEvent } from '../db';

interface DoseEventState {
  todayEvents: DoseEvent[];
  isLoading: boolean;
  loadTodayEvents: (dateStr: string) => Promise<void>;
  markTaken: (id: string) => Promise<void>;
  markSkipped: (id: string) => Promise<void>;
  addEvent: (event: DoseEvent) => Promise<void>;
}

export const useDoseEventStore = create<DoseEventState>((set) => ({
  todayEvents: [],
  isLoading: false,

  loadTodayEvents: async (dateStr) => {
    set({ isLoading: true });
    const todayEvents = await getDoseEventsByDate(dateStr);
    set({ todayEvents, isLoading: false });
  },

  markTaken: async (id) => {
    const now = new Date().toISOString();
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'taken' as const, takenAt: now } : e,
      ),
    }));
    await updateDoseEventStatus(id, 'taken', now);
  },

  markSkipped: async (id) => {
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'skipped' as const } : e,
      ),
    }));
    await updateDoseEventStatus(id, 'skipped');
  },

  addEvent: async (event) => {
    await insertDoseEvent(event);
    set((state) => ({ todayEvents: [...state.todayEvents, event] }));
  },
}));
