import { create } from 'zustand';
import type { PointLedger } from '../domain';
import { getBalance, getHistory } from '../features/points/pointEngine';
import { getCurrentStreak } from '../features/points/streakCalculator';
import { getDoseEventsByDateRange } from '../db';
import { useAuthStore } from './authStore';
import { toLocalISOString } from '../utils';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface PointState {
  balance:      number;
  streak:       number;
  history:      PointLedger[];
  _lastUserId:  string | null;
  fetchBalance: () => Promise<void>;
  fetchHistory: () => Promise<void>;
}

export const usePointStore = create<PointState>((set, get) => ({
  balance:     0,
  streak:      0,
  history:     [],
  _lastUserId: null,

  fetchBalance: async () => {
    try {
      const uid = currentUserId();
      const userChanged = get()._lastUserId !== uid;
      if (userChanged) set({ balance: 0, streak: 0, _lastUserId: uid });

      const from = new Date();
      from.setDate(from.getDate() - 90);
      const [balance, events] = await Promise.all([
        getBalance(uid),
        getDoseEventsByDateRange(toLocalISOString(from), toLocalISOString(new Date()), uid),
      ]);
      set({ balance, streak: getCurrentStreak(events), _lastUserId: uid });
    } catch {
      // 잔액 조회 실패 시 기존 값 유지
    }
  },

  fetchHistory: async () => {
    try {
      const uid = currentUserId();
      const userChanged = get()._lastUserId !== uid;
      if (userChanged) set({ history: [], _lastUserId: uid });
      const history = await getHistory(uid);
      set({ history });
    } catch {
      // 히스토리 조회 실패 시 기존 값 유지
    }
  },
}));
