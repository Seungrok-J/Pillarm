jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/features/points/pointEngine', () => ({
  getBalance: jest.fn(),
  getHistory: jest.fn(),
}));
jest.mock('../../src/features/points/streakCalculator', () => ({
  getCurrentStreak: jest.fn(),
}));
jest.mock('../../src/db/doseEvents', () => ({
  getDoseEventsByDateRange: jest.fn(),
}));

import { usePointStore } from '../../src/store/pointStore';
import { getBalance, getHistory } from '../../src/features/points/pointEngine';
import { getCurrentStreak } from '../../src/features/points/streakCalculator';
import { getDoseEventsByDateRange } from '../../src/db/doseEvents';

const mockGetBalance  = getBalance  as jest.Mock;
const mockGetHistory  = getHistory  as jest.Mock;
const mockGetStreak   = getCurrentStreak as jest.Mock;
const mockGetEvents   = getDoseEventsByDateRange as jest.Mock;

function resetStore() {
  usePointStore.setState({ balance: 0, streak: 0, history: [] });
}

describe('pointStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  // ── fetchBalance ───────────────────────────────────────────────────────────

  describe('fetchBalance', () => {
    it('잔액과 streak 를 업데이트한다', async () => {
      mockGetBalance.mockResolvedValue(500);
      mockGetEvents.mockResolvedValue([]);
      mockGetStreak.mockReturnValue(7);

      await usePointStore.getState().fetchBalance();

      const state = usePointStore.getState();
      expect(state.balance).toBe(500);
      expect(state.streak).toBe(7);
    });

    it('에러 발생 시 상태를 변경하지 않는다', async () => {
      mockGetBalance.mockRejectedValue(new Error('DB error'));

      await usePointStore.getState().fetchBalance();

      expect(usePointStore.getState().balance).toBe(0);
    });
  });

  // ── fetchHistory ───────────────────────────────────────────────────────────

  describe('fetchHistory', () => {
    it('포인트 히스토리를 업데이트한다', async () => {
      const fakeHistory = [{ id: 'l1', userId: 'local', delta: 10, reason: 'taken', createdAt: '2025-01-01T00:00:00.000Z' }];
      mockGetHistory.mockResolvedValue(fakeHistory);

      await usePointStore.getState().fetchHistory();

      expect(usePointStore.getState().history).toEqual(fakeHistory);
    });

    it('에러 발생 시 상태를 변경하지 않는다', async () => {
      mockGetHistory.mockRejectedValue(new Error('DB error'));

      await usePointStore.getState().fetchHistory();

      expect(usePointStore.getState().history).toEqual([]);
    });
  });
});
