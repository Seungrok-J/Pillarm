import { isInQuietHours, adjustForQuietHours } from '../../src/notifications/quietHours';
import { UserSettings } from '../../src/domain';

// ── 픽스처 ─────────────────────────────────────────────────────────────────

const BASE: UserSettings = {
  userId: 'local',
  timeZone: 'Asia/Seoul',
  defaultSnoozeMinutes: 15,
  maxSnoozeCount: 3,
  missedToLateMinutes: 120,
  autoMarkMissedEnabled: true,
  mealTimeBreakfast: '08:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '19:00',
};

/** 로컬 시각으로 Date 생성 (타임존 독립적 테스트) */
function localDate(h: number, m: number, dayOffset = 0): Date {
  const d = new Date(2026, 3, 22 + dayOffset, h, m, 0, 0); // April 22 2026
  return d;
}

const NIGHT_SETTINGS: UserSettings = {
  ...BASE,
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
};

const DAY_SETTINGS: UserSettings = {
  ...BASE,
  quietHoursStart: '13:00',
  quietHoursEnd: '15:00',
};

// ═══════════════════════════════════════════════════════════════════════════
// isInQuietHours
// ═══════════════════════════════════════════════════════════════════════════

describe('isInQuietHours', () => {
  describe('설정 없음', () => {
    it('quietHoursStart 가 없으면 false 반환', () => {
      expect(isInQuietHours(localDate(2, 0), BASE)).toBe(false);
    });
  });

  describe('자정을 넘는 구간 (23:00–07:00)', () => {
    it('저녁 구간: 23:30 → true', () => {
      expect(isInQuietHours(localDate(23, 30), NIGHT_SETTINGS)).toBe(true);
    });

    it('새벽 구간: 01:00 → true', () => {
      expect(isInQuietHours(localDate(1, 0), NIGHT_SETTINGS)).toBe(true);
    });

    it('시작 경계: 23:00 → true (포함)', () => {
      expect(isInQuietHours(localDate(23, 0), NIGHT_SETTINGS)).toBe(true);
    });

    it('종료 경계: 07:00 → false (미포함)', () => {
      expect(isInQuietHours(localDate(7, 0), NIGHT_SETTINGS)).toBe(false);
    });

    it('낮 시간: 12:00 → false', () => {
      expect(isInQuietHours(localDate(12, 0), NIGHT_SETTINGS)).toBe(false);
    });

    it('저녁 직전: 22:59 → false', () => {
      expect(isInQuietHours(localDate(22, 59), NIGHT_SETTINGS)).toBe(false);
    });
  });

  describe('동일 날짜 구간 (13:00–15:00)', () => {
    it('구간 내: 14:00 → true', () => {
      expect(isInQuietHours(localDate(14, 0), DAY_SETTINGS)).toBe(true);
    });

    it('시작 경계: 13:00 → true', () => {
      expect(isInQuietHours(localDate(13, 0), DAY_SETTINGS)).toBe(true);
    });

    it('종료 경계: 15:00 → false', () => {
      expect(isInQuietHours(localDate(15, 0), DAY_SETTINGS)).toBe(false);
    });

    it('구간 밖: 16:00 → false', () => {
      expect(isInQuietHours(localDate(16, 0), DAY_SETTINGS)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// adjustForQuietHours
// ═══════════════════════════════════════════════════════════════════════════

describe('adjustForQuietHours', () => {
  it('조용한 시간대 밖이면 원본 date 를 그대로 반환한다', () => {
    const date = localDate(12, 0);
    expect(adjustForQuietHours(date, NIGHT_SETTINGS)).toBe(date); // 동일 참조
  });

  it('설정 없으면 원본 date 를 그대로 반환한다', () => {
    const date = localDate(2, 0);
    expect(adjustForQuietHours(date, BASE)).toBe(date);
  });

  describe('자정을 넘는 구간 (23:00–07:00)', () => {
    it('저녁(23:30): 다음 날 07:00 으로 이동', () => {
      const date = localDate(23, 30);
      const adjusted = adjustForQuietHours(date, NIGHT_SETTINGS);

      expect(adjusted.getHours()).toBe(7);
      expect(adjusted.getMinutes()).toBe(0);
      // 날짜가 하루 늘어야 함
      expect(adjusted.getDate()).toBe(date.getDate() + 1);
    });

    it('새벽(01:00): 당일 07:00 으로 이동', () => {
      const date = localDate(1, 0);
      const adjusted = adjustForQuietHours(date, NIGHT_SETTINGS);

      expect(adjusted.getHours()).toBe(7);
      expect(adjusted.getMinutes()).toBe(0);
      expect(adjusted.getDate()).toBe(date.getDate()); // 날짜 변경 없음
    });

    it('새벽(00:00): 당일 07:00 으로 이동', () => {
      const date = localDate(0, 0);
      const adjusted = adjustForQuietHours(date, NIGHT_SETTINGS);

      expect(adjusted.getHours()).toBe(7);
      expect(adjusted.getDate()).toBe(date.getDate());
    });

    it('조용한 시간대 조정 후 초·밀리초는 0', () => {
      const adjusted = adjustForQuietHours(localDate(23, 30), NIGHT_SETTINGS);
      expect(adjusted.getSeconds()).toBe(0);
      expect(adjusted.getMilliseconds()).toBe(0);
    });
  });

  describe('동일 날짜 구간 (13:00–15:00)', () => {
    it('구간 내(14:00): 당일 15:00 으로 이동', () => {
      const date = localDate(14, 0);
      const adjusted = adjustForQuietHours(date, DAY_SETTINGS);

      expect(adjusted.getHours()).toBe(15);
      expect(adjusted.getMinutes()).toBe(0);
      expect(adjusted.getDate()).toBe(date.getDate());
    });
  });
});
