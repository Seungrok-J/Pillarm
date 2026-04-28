jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));

import { getUserSettings, saveUserSettings } from '../../src/db/userSettings';
import { getDatabase } from '../../src/db/database';

const mockGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

function makeMockDb() {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync:     jest.fn().mockResolvedValue(undefined),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (m: ReturnType<typeof makeMockDb>) => m as any;

const BASE_ROW: Record<string, unknown> = {
  user_id: 'local',
  time_zone: 'Asia/Seoul',
  quiet_hours_start: '23:00',
  quiet_hours_end: '07:00',
  default_snooze_minutes: 15,
  max_snooze_count: 3,
  missed_to_late_minutes: 120,
  auto_mark_missed_enabled: 1,
};

describe('userSettings DB', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(db));
  });

  // ── getUserSettings ───────────────────────────────────────────────────────

  describe('getUserSettings', () => {
    it('저장된 설정이 있으면 매핑하여 반환한다', async () => {
      db.getFirstAsync.mockResolvedValue(BASE_ROW);
      const result = await getUserSettings();
      expect(result.userId).toBe('local');
      expect(result.timeZone).toBe('Asia/Seoul');
      expect(result.quietHoursStart).toBe('23:00');
      expect(result.autoMarkMissedEnabled).toBe(true);
    });

    it('auto_mark_missed_enabled=0 이면 false 반환', async () => {
      db.getFirstAsync.mockResolvedValue({ ...BASE_ROW, auto_mark_missed_enabled: 0 });
      const result = await getUserSettings();
      expect(result.autoMarkMissedEnabled).toBe(false);
    });

    it('저장된 설정이 없으면 기본값 저장 후 반환', async () => {
      const result = await getUserSettings();
      // 기본값 저장을 위해 runAsync 1회 호출
      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect(result.quietHoursStart).toBe('23:00');
      expect(result.defaultSnoozeMinutes).toBe(15);
    });
  });

  // ── saveUserSettings ──────────────────────────────────────────────────────

  describe('saveUserSettings', () => {
    it('UPSERT 쿼리를 실행한다', async () => {
      await saveUserSettings({
        userId: 'local',
        timeZone: 'Asia/Seoul',
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        defaultSnoozeMinutes: 10,
        maxSnoozeCount: 5,
        missedToLateMinutes: 60,
        autoMarkMissedEnabled: false,
      });
      expect(db.runAsync).toHaveBeenCalledTimes(1);
      expect(db.runAsync.mock.calls[0][0]).toContain('ON CONFLICT(user_id) DO UPDATE SET');
    });

    it('autoMarkMissedEnabled=false 이면 0 전달', async () => {
      await saveUserSettings({
        userId: 'local',
        timeZone: 'Asia/Seoul',
        defaultSnoozeMinutes: 10,
        maxSnoozeCount: 3,
        missedToLateMinutes: 120,
        autoMarkMissedEnabled: false,
      });
      expect(db.runAsync.mock.calls[0]).toContain(0);
    });
  });
});
