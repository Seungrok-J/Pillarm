export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayString(): string {
  return toLocalISOString(new Date()).slice(0, 10);
}

/** 'YYYY-MM-DD' 를 로컬 자정 Date 로. new Date(str) 은 UTC 로 읽혀 하루 밀린다 */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date 를 로컬 기준 'YYYY-MM-DD' 로. toDateString 은 UTC 기준이라 날짜가 밀릴 수 있다 */
export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' 에 일수를 더해 'YYYY-MM-DD' 로 돌려준다(월·연 경계 자동 처리) */
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateString(d);
}

export function isInQuietHours(
  time: Date,
  quietStart?: string,
  quietEnd?: string,
): boolean {
  if (!quietStart || !quietEnd) return false;
  const hhmm = time.toTimeString().slice(0, 5);
  if (quietStart < quietEnd) {
    return hhmm >= quietStart && hhmm < quietEnd;
  }
  return hhmm >= quietStart || hhmm < quietEnd;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** 로컬 시각 기준 ISO-8601 (YYYY-MM-DDTHH:mm:ss, 타임존 없음) — plannedAt 과 동일한 포맷 */
export function toLocalISOString(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}
