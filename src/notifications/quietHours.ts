import { UserSettings } from '../domain';

/**
 * date 가 UserSettings 에 설정된 조용한 시간대에 포함되는지 반환합니다.
 * 자정을 넘는 구간(예: 23:00–07:00)도 올바르게 처리합니다.
 */
export function isInQuietHours(date: Date, settings: UserSettings): boolean {
  const { quietHoursStart, quietHoursEnd } = settings;
  if (!quietHoursStart || !quietHoursEnd) return false;

  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const hhmm = `${h}:${m}`;

  if (quietHoursStart < quietHoursEnd) {
    // 동일 날짜 내 구간 예: 01:00–06:00
    return hhmm >= quietHoursStart && hhmm < quietHoursEnd;
  }
  // 자정을 넘는 구간 예: 23:00–07:00
  return hhmm >= quietHoursStart || hhmm < quietHoursEnd;
}

/**
 * date 가 조용한 시간대에 속하면 quietHoursEnd 시점으로 이동한 Date 를 반환합니다.
 * 조용한 시간대 밖이면 date 를 그대로 반환합니다.
 *
 * 자정 크로스 케이스:
 *   23:30 (quiet 23:00–07:00) → 다음 날 07:00
 *   01:00 (quiet 23:00–07:00) → 당일    07:00
 */
export function adjustForQuietHours(date: Date, settings: UserSettings): Date {
  if (!isInQuietHours(date, settings)) return date;

  const { quietHoursEnd } = settings;
  if (!quietHoursEnd) return date;

  const [endH, endM] = quietHoursEnd.split(':').map(Number) as [number, number];

  const adjusted = new Date(date);
  adjusted.setHours(endH, endM, 0, 0);

  // adjusted 가 원본보다 이전이거나 같으면 자정을 넘은 케이스 → +1일
  if (adjusted <= date) {
    adjusted.setDate(adjusted.getDate() + 1);
  }

  return adjusted;
}
