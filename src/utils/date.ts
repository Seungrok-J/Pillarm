export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayString(): string {
  return toDateString(new Date());
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
