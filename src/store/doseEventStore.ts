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
import { isSyncEnabled, pushDoseEvent, uploadTodaySnapshot } from '../sync/syncService';
import { usePointStore } from './pointStore';
import { toLocalISOString } from '../utils';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface DoseEventState {
  todayEvents: DoseEvent[];
  isLoading: boolean;
  error: string | null;
  fetchTodayEvents: (dateStr: string) => Promise<void>;
  fetchByDateRange: (startIso: string, endIso: string) => Promise<DoseEvent[]>;
  markTaken: (id: string) => Promise<{ streakAwarded: boolean; pointsAwarded: boolean }>;
  markPacketTaken: (ids: string[]) => Promise<{ streakAwarded: boolean; pointsAwarded: boolean }>;
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
      // missed로 전환된 이벤트를 서버에 push — missedDoseNotifier 트리거 및 보호자 스냅샷 갱신
      if (isSyncEnabled()) {
        const missedEvents = todayEvents.filter((e) => e.status === 'missed');
        if (missedEvents.length > 0) {
          missedEvents.forEach((e) => pushDoseEvent(e).catch(() => {}));
        }
        // 이벤트가 있으면 항상 스냅샷 업로드 — scheduled 상태 포함, 보호자가 즉시 확인 가능하도록
        if (todayEvents.length > 0) {
          uploadTodaySnapshot(currentUserId(), todayEvents).catch(() => {});
        }
      }
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
    // plannedAt 은 로컬 ISO(타임존 없음)이므로 takenAt 도 같은 형식으로 맞춰야
    // awardDoseTaken 의 시간 창 비교가 정확하게 동작한다.
    const now   = toLocalISOString(new Date());
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
      let streakAwarded = false;
      let pointsAwarded = false;
      if (event) {
        const graceMinutes = useSettingsStore.getState().settings?.missedToLateMinutes ?? 120;
        const takenEvent: DoseEvent = { ...event, status: 'taken', takenAt: now };
        const uid = currentUserId();
        let pointsEntry: Awaited<ReturnType<typeof awardDoseTaken>> = null;
        let streakEntry: { delta: number } | null = null;
        await Promise.all([
          awardDoseTaken(takenEvent, graceMinutes, uid)
            .then((entry) => { pointsEntry = entry; })
            .catch(() => {}),
          awardStreakBonus(uid)
            .then((entry) => { streakEntry = entry; })
            .catch(() => {}),
        ]);
        streakAwarded = streakEntry !== null;
        pointsAwarded = pointsEntry !== null;
        // 포인트 적립 후 잔액 UI 즉시 갱신
        await usePointStore.getState().fetchBalance();
      }
      if (isSyncEnabled()) {
        const allEvents = get().todayEvents;
        const updated = allEvents.find((e) => e.id === id);
        if (updated) pushDoseEvent(updated).catch(() => {});
        uploadTodaySnapshot(currentUserId(), allEvents).catch(() => {});
      }
      return { streakAwarded, pointsAwarded };
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      throw e;
    }
  },

  markPacketTaken: async (ids) => {
    const now = toLocalISOString(new Date());
    const prev = get().todayEvents;
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        ids.includes(e.id) ? { ...e, status: 'taken' as const, takenAt: now, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await Promise.all(ids.map((id) => updateDoseEventStatus(id, 'taken', now)));
      ids.forEach((id) => cancelNotificationForDoseEvent(id).catch(() => {}));

      // 포인트·스트릭은 첫 번째 이벤트 기준 1회만 지급
      const graceMinutes = useSettingsStore.getState().settings?.missedToLateMinutes ?? 120;
      const uid = currentUserId();
      const firstEvent = get().todayEvents.find((e) => ids[0] === e.id);
      let pointsAwarded = false;
      let streakAwarded = false;
      if (firstEvent) {
        const takenEvent: DoseEvent = { ...firstEvent, status: 'taken', takenAt: now };
        let pointsEntry: Awaited<ReturnType<typeof awardDoseTaken>> = null;
        let streakEntry: { delta: number } | null = null;
        await Promise.all([
          awardDoseTaken(takenEvent, graceMinutes, uid).then((e) => { pointsEntry = e; }).catch(() => {}),
          awardStreakBonus(uid).then((e) => { streakEntry = e; }).catch(() => {}),
        ]);
        pointsAwarded = pointsEntry !== null;
        streakAwarded = streakEntry !== null;
        await usePointStore.getState().fetchBalance();
      }

      if (isSyncEnabled()) {
        const allEvents = get().todayEvents;
        allEvents.filter((e) => ids.includes(e.id)).forEach((e) => pushDoseEvent(e).catch(() => {}));
        uploadTodaySnapshot(uid, allEvents).catch(() => {});
      }
      return { streakAwarded, pointsAwarded };
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      throw e;
    }
  },

  markSkipped: async (id) => {
    const now = toLocalISOString(new Date());
    const prev = get().todayEvents;
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === id ? { ...e, status: 'skipped' as const, updatedAt: now } : e,
      ),
      error: null,
    }));
    try {
      await updateDoseEventStatus(id, 'skipped');
      if (isSyncEnabled()) {
        const allEvents = get().todayEvents;
        const updated = allEvents.find((e) => e.id === id);
        if (updated) pushDoseEvent(updated).catch(() => {});
        uploadTodaySnapshot(currentUserId(), allEvents).catch(() => {});
      }
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
      if (isSyncEnabled()) {
        const allEvents = get().todayEvents;
        const updated = allEvents.find((e) => e.id === id);
        if (updated) pushDoseEvent(updated).catch(() => {});
        uploadTodaySnapshot(currentUserId(), allEvents).catch(() => {});
      }
      return true;
    } catch (e) {
      set({ todayEvents: prev, error: (e as Error).message });
      return false;
    }
  },
}));
