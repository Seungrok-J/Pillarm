import { toDateString, isInQuietHours, addMinutes } from '../src/utils/date';

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-04-22T10:00:00Z'))).toBe('2026-04-22');
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
});

describe('addMinutes', () => {
  it('adds minutes to a date', () => {
    const base = new Date('2026-04-22T10:00:00Z');
    const result = addMinutes(base, 30);
    expect(result.toISOString()).toBe('2026-04-22T10:30:00.000Z');
  });
});
