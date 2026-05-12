import prisma from '../lib/prisma';
import { notifyMissedDose } from './fcmService';

const CHECK_INTERVAL_MS = 5 * 60_000; // 5 minutes

async function checkAndNotify(notifiedIds: Set<string>): Promise<void> {
  // Look back 2 × interval to catch events missed between ticks.
  const since = new Date(Date.now() - 2 * CHECK_INTERVAL_MS).toISOString();

  const missedEvents = await prisma.doseEvent.findMany({
    where: {
      status: 'missed',
      updatedAt: { gte: since },
    },
    include: {
      user: {
        include: {
          ownedCircles: {
            include: {
              members: {
                include: { member: true },
              },
            },
          },
        },
      },
    },
  });

  for (const event of missedEvents) {
    if (notifiedIds.has(event.id)) continue;
    notifiedIds.add(event.id);

    const guardianTokens: string[] = [];
    for (const circle of event.user.ownedCircles) {
      for (const m of circle.members) {
        if (m.member.fcmToken) {
          guardianTokens.push(m.member.fcmToken);
        }
      }
    }

    if (guardianTokens.length === 0) continue;

    const medication = await prisma.medication.findUnique({
      where: { id: event.medicationId },
    });

    await notifyMissedDose(
      guardianTokens,
      event.user.email ?? event.user.name ?? '사용자',
      medication?.name ?? '약',
    );
  }
}

/** Start the notifier. Returns a stop function. Each call creates an isolated dedup set. */
export function startMissedDoseNotifier(): () => void {
  const notifiedIds = new Set<string>();

  const intervalId = setInterval(() => {
    checkAndNotify(notifiedIds).catch((err: unknown) => {
      console.error('[missedDoseNotifier] check failed:', err);
    });
  }, CHECK_INTERVAL_MS);

  console.log('[missedDoseNotifier] started (interval=5min)');
  return () => clearInterval(intervalId);
}
