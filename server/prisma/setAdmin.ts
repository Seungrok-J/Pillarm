/**
 * 특정 이메일 계정을 관리자로 설정하는 일회성 스크립트
 * 실행: npx ts-node -e "require('./prisma/setAdmin.ts')" — 또는
 *       cd server && npx ts-node prisma/setAdmin.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'seungrokjeong@gmail.com';

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ 유저를 찾을 수 없습니다: ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { email },
    data:  { isAdmin: true },
  });

  console.log(`✅ ${email} (id: ${user.id}) → isAdmin = true`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
