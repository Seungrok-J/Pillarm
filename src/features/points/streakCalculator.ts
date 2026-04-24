import type { DoseEvent } from '../../domain';

/**
 * Returns the number of consecutive completed days going back from the
 * most-recent date in `events`.
 *
 * Rules:
 *   - Day is "complete"  : at least one taken/late, no missed/skipped
 *   - Day is "in-progress": all events are still 'scheduled' → skipped (no break, no count)
 *   - Day is "broken"    : any missed or skipped → stops the streak
 *   - Days with no events: skipped (no medication that day → doesn't break streak)
 */
export function getCurrentStreak(events: DoseEvent[]): number {
  const byDate = new Map<string, DoseEvent[]>();
  for (const e of events) {
    const date = e.plannedAt.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }

  const dates = [...byDate.keys()].sort().reverse();
  let streak = 0;

  for (const date of dates) {
    const dayEvents = byDate.get(date)!;
    const hasMissed = dayEvents.some(
      (e) => e.status === 'missed' || e.status === 'skipped',
    );
    const hasTaken = dayEvents.some(
      (e) => e.status === 'taken' || e.status === 'late',
    );
    const allPending = dayEvents.every((e) => e.status === 'scheduled');

    if (hasMissed) break;
    if (allPending) continue; // today not yet complete — don't count, don't break
    if (hasTaken) streak++;
  }

  return streak;
}

/**
 * Returns true if the current week (Mon–today) has no missed events
 * and contains at least one event.
 *
 * 'skipped' is intentional and does NOT break perfect week.
 * 'scheduled' (in-progress today) is also acceptable.
 */
export function isPerfectWeek(events: DoseEvent[], today: Date = new Date()): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  const dow = today.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const weekEvents = events.filter((e) => {
    const d = e.plannedAt.slice(0, 10);
    return d >= weekStartStr && d <= todayStr;
  });

  if (weekEvents.length === 0) return false;
  return !weekEvents.some((e) => e.status === 'missed');
}
