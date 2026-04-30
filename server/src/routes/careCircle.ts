import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { generateInviteCode, validateInviteCode } from '../services/inviteService';

const router = Router();
router.use(requireAuth);

// ── POST /care-circles ───────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) throw new AppError('name required', 400);

    const circle = await prisma.careCircle.create({
      data: { name: name.trim(), ownerUserId: req.user!.userId },
    });
    res.status(201).json(circle);
  } catch (err) {
    next(err);
  }
});

// ── GET /care-circles ────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const circles = await prisma.careCircle.findMany({
      where: {
        OR: [
          { ownerUserId: userId },
          { members: { some: { memberUserId: userId } } },
        ],
      },
      include: {
        owner: { select: { name: true, email: true } },
        members: {
          include: { member: { select: { name: true, email: true } } },
        },
      },
    });

    const result = circles.map((c) => ({
      id:             c.id,
      ownerUserId:    c.ownerUserId,
      ownerUserName:  c.owner.name,
      ownerUserEmail: c.owner.email,
      name:           c.name,
      createdAt:      c.createdAt,
      updatedAt:      c.updatedAt,
      members: c.members.map((m) => ({
        id:              m.id,
        careCircleId:    m.careCircleId,
        memberUserId:    m.memberUserId,
        memberUserName:  m.member.name,
        memberUserEmail: m.member.email,
        role:            m.role,
        nickname:        m.nickname,
        createdAt:       m.createdAt,
      })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /care-circles/join ──────────────────────────────────────────────────
// Registered before /:id to prevent "join" being treated as an id param

router.post('/join', async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code?.trim()) throw new AppError('code required', 400);

    const userId = req.user!.userId;
    const circleId = await validateInviteCode(code.trim().toUpperCase());

    const existing = await prisma.careMember.findUnique({
      where: { careCircleId_memberUserId: { careCircleId: circleId, memberUserId: userId } },
    });
    if (existing) throw new AppError('Already a member', 409);

    const member = await prisma.careMember.create({
      data: { careCircleId: circleId, memberUserId: userId, role: 'viewer' },
    });
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// ── GET /care-circles/:id ────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const circle = await prisma.careCircle.findUnique({
      where: { id },
      include: { members: true, policies: true },
    });
    if (!circle) throw new AppError('Not found', 404);

    const isMember =
      circle.ownerUserId === userId ||
      circle.members.some((m) => m.memberUserId === userId);
    if (!isMember) throw new AppError('Forbidden', 403);

    res.json(circle);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /care-circles/:id ─────────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const circle = await prisma.careCircle.findUnique({ where: { id } });
    if (!circle) throw new AppError('Not found', 404);
    if (circle.ownerUserId !== userId) throw new AppError('Forbidden', 403);

    await prisma.careCircle.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── DELETE /care-circles/:id/members/:memberId ───────────────────────────────

router.delete('/:id/members/:memberId', async (req, res, next) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user!.userId;

    const circle = await prisma.careCircle.findUnique({ where: { id } });
    if (!circle) throw new AppError('Not found', 404);
    if (circle.ownerUserId !== userId) throw new AppError('Forbidden', 403);

    const member = await prisma.careMember.findUnique({ where: { id: memberId } });
    if (!member || member.careCircleId !== id) throw new AppError('Not found', 404);

    await prisma.careMember.delete({ where: { id: memberId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── PATCH /care-circles/:id/members/:memberId ─────────────────────────────────

router.patch('/:id/members/:memberId', async (req, res, next) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user!.userId;
    const { nickname } = req.body as { nickname?: string };

    const circle = await prisma.careCircle.findUnique({ where: { id } });
    if (!circle) throw new AppError('Not found', 404);
    if (circle.ownerUserId !== userId) throw new AppError('Forbidden', 403);

    const member = await prisma.careMember.findUnique({ where: { id: memberId } });
    if (!member || member.careCircleId !== id) throw new AppError('Not found', 404);

    const updated = await prisma.careMember.update({
      where: { id: memberId },
      data: { nickname: nickname?.trim() || null },
      include: { member: { select: { name: true, email: true } } },
    });

    res.json({
      id:              updated.id,
      careCircleId:    updated.careCircleId,
      memberUserId:    updated.memberUserId,
      memberUserName:  updated.member.name,
      memberUserEmail: updated.member.email,
      role:            updated.role,
      nickname:        updated.nickname,
      createdAt:       updated.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /care-circles/:id/invite ────────────────────────────────────────────

router.post('/:id/invite', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const circle = await prisma.careCircle.findUnique({ where: { id } });
    if (!circle) throw new AppError('Not found', 404);
    if (circle.ownerUserId !== userId) throw new AppError('Forbidden', 403);

    const { code, expiresAt } = await generateInviteCode(id);
    res.status(201).json({ code, expiresAt });
  } catch (err) {
    next(err);
  }
});

export default router;
