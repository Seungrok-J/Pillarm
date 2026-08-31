/**
 * 특정 이메일 계정을 관리자로 설정하는 일회성 스크립트
 * 실행: cd server && ADMIN_EMAIL=someone@example.com npx ts-node prisma/setAdmin.ts
 *
 * 대상 이메일은 인자 또는 ADMIN_EMAIL 환경변수로 받는다 —
 * 개인 이메일을 저장소에 남기지 않기 위함.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) {
    console.error('❌ 대상 이메일이 없습니다. 사용법: npx ts-node prisma/setAdmin.ts <email>');
    console.error('   또는 ADMIN_EMAIL 환경변수를 설정하세요.');
    process.exit(1);
  }

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
