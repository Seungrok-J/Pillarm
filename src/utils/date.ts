export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayString(): string {
  return toLocalISOString(new Date()).slice(0, 10);
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
