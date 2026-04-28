import { toDateString, todayString, isInQuietHours, addMinutes } from '../src/utils/date';

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-04-22T10:00:00Z'))).toBe('2026-04-22');
  });
});

describe('todayString', () => {
  it('오늘 날짜를 YYYY-MM-DD 형식으로 반환한다', () => {
    const result = todayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isInQuietHours', () => {
  it('returns false when no quiet hours configured', () => {
    expect(isInQuietHours(new Date())).toBe(false);
  });

  it('detects time inside non-wrapping quiet window', () => {
    const midnight = new Date('2026-04-22T23:30:00');
    expect(isInQuietHours(midnight, '23:00', '07:00')).toBe(true);
  });

  it('detects time outside quiet window', () => {
    const noon = new Date('2026-04-22T12:00:00');
    expect(isInQuietHours(noon, '23:00', '07:00')).toBe(false);
  });

  it('quietStart < quietEnd (낮 구간) 안에 있으면 true', () => {
    const eleven = new Date('2026-04-22T11:00:00');
    expect(isInQuietHours(eleven, '10:00', '12:00')).toBe(true);
  });

  it('quietStart < quietEnd (낮 구간) 밖이면 false', () => {
    const nine = new Date('2026-04-22T09:00:00');
    expect(isInQuietHours(nine, '10:00', '12:00')).toBe(false);
  });
});

describe('addMinutes', () => {
  it('adds minutes to a date', () => {
    const base = new Date('2026-04-22T10:00:00Z');
    const result = addMinutes(base, 30);
    expect(result.toISOString()).toBe('2026-04-22T10:30:00.000Z');
  });
});
