import { create } from 'zustand';
import { DoseEvent } from '../domain';
import {
  getDoseEventsByDate,
  getDoseEventsByDateRange,
  updateDoseEventStatus,
  updateDoseEventSnooze,
} from '../db';

interface DoseEventState {
  todayEvents: DoseEvent[];
  isLoading: boolean;
  error: string | null;
  fetchTodayEvents: (dateStr: string) => Promise<void>;
  fetchByDateRange: (startIso: string, endIso: string) => Promise<DoseEvent[]>;
  markTaken: (id: string) => Promise<void>;
  markSkipped: (id: string) => Promise<void>;
  /** snoozeCount를 1 증가시킵니다. maxSnoozeCount 초과 시 false 반환. */
  snooze: (id: string, maxSnoozeCount: number) => Promise<boolean>;
}

export const useDoseEventStore = create<DoseEventState>((set, get) => ({
  todayEvents: [],
  isLoading: false,
  error: null,

  fetchTodayEvents: async (dateStr) => {
    set({ isLoading: true, error: null });
    try {
      const todayEvents = await getDoseEventsByDate(dateStr);
      set({ todayEvents, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  fetchByDateRange: async (startIso, endIso) => {
    try {
      return await getDoseEventsByDateRange(startIso, endIso);
    } catch (e) {
      set({ error: (e as Error).message });
      return [];
    }
  },

  markTaken: async (id) => {
    const now = new Date().toISOString();
    const prev = get().todayEvents;
    // Optimistic update — PRD: "탭 시 즉시 카드가 '완료' 상태로 변한다"
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'taken' as const, takenAt: now, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventStatus(id, 'taken', now);
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      throw e;
    }
  },

  markSkipped: async (id) => {
    const now = new Date().toISOString();
    const prev = get().todayEvents;
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'skipped' as const, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventStatus(id, 'skipped');
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      throw e;
    }
  },

  snooze: async (id, maxSnoozeCount) => {
    const event = get().todayEvents.find((e) => e.id === id);
    if (!event) return false;
    if (event.snoozeCount >= maxSnoozeCount) return false;

    const newCount = event.snoozeCount + 1;
    const now = new Date().toISOString();
    const prev = get().todayEvents;

    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, snoozeCount: newCount, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventSnooze(id, newCount);
      return true;
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      return false;
    }
  },
}));
