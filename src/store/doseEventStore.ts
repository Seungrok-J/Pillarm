import { create } from 'zustand';
import { DoseEvent } from '../domain';
import {
  getDoseEventsByDate,
  getDoseEventsByDateRange,
  updateDoseEventStatus,
  updateDoseEventSnooze,
} from '../db';
import { useSettingsStore } from './settingsStore';
import { useAuthStore } from './authStore';
import { awardDoseTaken, awardStreakBonus } from '../features/points/pointEngine';
import { cancelNotificationForDoseEvent, checkAndMarkMissed } from '../notifications/scheduler';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface DoseEventState {
  todayEvents: DoseEvent[];
  isLoading: boolean;
  error: string | null;
  fetchTodayEvents: (dateStr: string) => Promise<void>;
  fetchByDateRange: (startIso: string, endIso: string) => Promise<DoseEvent[]>;
  markTaken: (id: string) => Promise<void>;
  markSkipped: (id: string) => Promise<void>;
  /** snoozeCount를 1 증가시키고 plannedAt을 snoozeMinutes 후로 업데이트합니다. 3회 고정 초과 시 false 반환. */
  snooze: (id: string, snoozeMinutes: number) => Promise<boolean>;
}

export const useDoseEventStore = create<DoseEventState>((set, get) => ({
  todayEvents: [],
  isLoading: false,
  error: null,

  fetchTodayEvents: async (dateStr) => {
    set({ isLoading: true, error: null, todayEvents: [] });
    try {
      const settings = useSettingsStore.getState().settings;
      if (settings) await checkAndMarkMissed(settings);
      const todayEvents = await getDoseEventsByDate(dateStr, currentUserId());
      set({ todayEvents, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  fetchByDateRange: async (startIso, endIso) => {
    try {
      return await getDoseEventsByDateRange(startIso, endIso, currentUserId());
    } catch (e) {
      set({ error: (e as Error).message });
      return [];
    }
  },

  markTaken: async (id) => {
    const now   = new Date().toISOString();
    const event = get().todayEvents.find((e) => e.id === id);
    const prev  = get().todayEvents;
    // Optimistic update — PRD: "탭 시 즉시 카드가 '완료' 상태로 변한다"
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'taken' as const, takenAt: now, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventStatus(id, 'taken', now);
      // 복용 완료 시 예약된 알림 취소
      cancelNotificationForDoseEvent(id).catch(() => {});
      // 포인트 적립 후 fetchBalance가 최신값을 읽도록 await 처리
      if (event) {
        const graceMinutes = useSettingsStore.getState().settings?.missedToLateMinutes ?? 120;
        const takenEvent: DoseEvent = { ...event, status: 'taken', takenAt: now };
        await Promise.all([
          awardDoseTaken(takenEvent, graceMinutes).catch(() => {}),
          awardStreakBonus('local').catch(() => {}),
        ]);
      }
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

  snooze: async (id, snoozeMinutes) => {
    const FIXED_MAX = 3;
    const event = get().todayEvents.find((e) => e.id === id);
    if (!event) return false;
    if (event.snoozeCount >= FIXED_MAX) return false;

    const newCount  = event.snoozeCount + 1;
    const snoozeDate = new Date(new Date(event.plannedAt).getTime() + snoozeMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const newPlannedAt =
      `${snoozeDate.getFullYear()}-${pad(snoozeDate.getMonth() + 1)}-${pad(snoozeDate.getDate())}` +
      `T${pad(snoozeDate.getHours())}:${pad(snoozeDate.getMinutes())}:${pad(snoozeDate.getSeconds())}`;
    const nowIso = new Date().toISOString();
    const prev = get().todayEvents;

    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, snoozeCount: newCount, plannedAt: newPlannedAt, updatedAt: nowIso } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventSnooze(id, newCount, newPlannedAt);
      return true;
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      return false;
    }
  },
}));
