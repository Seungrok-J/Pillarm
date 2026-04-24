import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

function todayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function assertCircleMember(
  circleId: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof prisma.careCircle.findUnique>>> {
  const circle = await prisma.careCircle.findUnique({
    where: { id: circleId },
    include: { members: true },
  });
  if (!circle) throw new AppError('Circle not found', 404);

  const isMember =
    circle.ownerUserId === userId ||
    circle.members.some((m) => m.memberUserId === userId);
  if (!isMember) throw new AppError('Forbidden', 403);

  return circle;
}

// ── PUT /care-circles/:id/members/:userId/today ──────────────────────────────
// 복용 대상자 본인만 자신의 스냅샷을 업로드할 수 있다

router.put('/:id/members/:userId/today', async (req, res, next) => {
  try {
    const { id: circleId, userId: patientId } = req.params;
    const requesterId = req.user!.userId;

    if (requesterId !== patientId) throw new AppError('Forbidden', 403);

    await assertCircleMember(circleId, requesterId);

    const date = todayDate();
    const snapshot = await prisma.doseEventSnapshot.upsert({
      where: { careCircleId_patientId_date: { careCircleId: circleId, patientId, date } },
      update: { data: req.body },
      create: { careCircleId: circleId, patientId, date, data: req.body },
    });

    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

// ── GET /care-circles/:id/members/:userId/today ──────────────────────────────
// 서클 구성원(보호자 포함)이 대상자의 오늘 스냅샷을 조회한다

router.get('/:id/members/:userId/today', async (req, res, next) => {
  try {
    const { id: circleId, userId: patientId } = req.params;
    const requesterId = req.user!.userId;

    await assertCircleMember(circleId, requesterId);

    const snapshot = await prisma.doseEventSnapshot.findUnique({
      where: {
        careCircleId_patientId_date: {
          careCircleId: circleId,
          patientId,
          date: todayDate(),
        },
      },
    });
    if (!snapshot) throw new AppError('No snapshot for today', 404);

    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;
