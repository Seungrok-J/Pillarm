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
  // 기존 코드 제거 후 새 코드 발급 (서클당 코드 1개 유지)
  await prisma.inviteCode.deleteMany({ where: { careCircleId } });

  const code = randomCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.inviteCode.create({ data: { careCircleId, code, expiresAt } });

  return { code, expiresAt };
}

export async function validateInviteCode(code: string): Promise<string> {
  // 만료 여부만 확인 — usedAt 체크 제거로 24시간 내 다중 참여 허용
  const invite = await prisma.inviteCode.findFirst({
    where: { code, expiresAt: { gt: new Date() } },
  });

  if (!invite) throw new AppError('초대 코드가 유효하지 않거나 만료되었습니다', 400);

  return invite.careCircleId;
}
