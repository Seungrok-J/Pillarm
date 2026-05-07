import { create } from 'zustand';
import type { PointLedger } from '../domain';
import { getBalance, getHistory } from '../features/points/pointEngine';
import { getCurrentStreak } from '../features/points/streakCalculator';
import { getDoseEventsByDateRange } from '../db';
import { useAuthStore } from './authStore';

function currentUserId() {
  return useAuthStore.getState().userId ?? 'local';
}

interface PointState {
  balance: number;
  streak:  number;
  history: PointLedger[];
  /**
   * 잔액과 streak 를 함께 갱신한다.
   * 홈 화면의 포인트·streak 배지가 이 액션으로 최신 상태를 유지한다.
   */
  fetchBalance: () => Promise<void>;
  fetchHistory: () => Promise<void>;
}

export const usePointStore = create<PointState>((set) => ({
  balance: 0,
  streak:  0,
  history: [],

  fetchBalance: async () => {
    try {
      const uid = currentUserId();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const [balance, events] = await Promise.all([
        getBalance(uid),
        getDoseEventsByDateRange(from.toISOString(), new Date().toISOString(), uid),
      ]);
      set({ balance, streak: getCurrentStreak(events) });
    } catch {}
  },

  fetchHistory: async () => {
    try {
      const history = await getHistory(currentUserId());
      set({ history });
    } catch {}
  },
}));
