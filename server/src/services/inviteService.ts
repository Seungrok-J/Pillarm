import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// Unambiguous chars (no 0/O, 1/I/L)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const TTL_MS = 24 * 60 * 60 * 1000;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function generateInviteCode(
  careCircleId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.inviteCode.create({ data: { careCircleId, code, expiresAt } });

  return { code, expiresAt };
}

export async function validateInviteCode(code: string): Promise<string> {
  const invite = await prisma.inviteCode.findFirst({
    where: { code, usedAt: null, expiresAt: { gt: new Date() } },
  });

  if (!invite) throw new AppError('Invalid or expired invite code', 400);

  await prisma.inviteCode.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  return invite.careCircleId;
}
