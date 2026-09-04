/**
 * 프로덕션 DB 전체를 JSON 한 파일로 내보낸다.
 *
 * Supabase 무료 플랜에는 자동 백업이 없어서 서버가 단일 장애점이다.
 * 이 스크립트가 유일한 서버 측 복구 수단이므로 주기적으로 돌려야 한다.
 *
 *   cd server
 *   DATABASE_URL="<프로덕션 접속 문자열>" npx tsx scripts/backup.ts [출력디렉터리]
 *
 * pg_dump 를 쓰지 않는 이유: supabase CLI 의 덤프는 Docker 데몬을 요구해서
 * 데몬이 꺼져 있으면 조용히 빈 파일을 남긴다. Prisma 로 읽으면 의존성이 없고
 * 어디서든(로컬·CI·Railway 크론) 같은 방식으로 돌릴 수 있다.
 *
 * **출력 파일에는 복약 정보(민감정보)와 이메일이 들어간다.**
 * 저장소에 커밋하지 말고, 저장 위치의 접근 권한을 확인할 것.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/** 내보낼 모델 — schema.prisma 에 모델을 추가하면 여기에도 추가한다. */
const MODELS = [
  'user',
  'socialConnection',
  'careCircle',
  'careMember',
  'sharePolicy',
  'doseEventSnapshot',
  'refreshToken',
  'medication',
  'schedule',
  'doseEvent',
  'featureFlag',
  'scanUsage',
  'inviteCode',
] as const;

async function main() {
  const outDir = process.argv[2] ?? path.join(process.cwd(), 'backups');
  fs.mkdirSync(outDir, { recursive: true });

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `pillarm-${stamp}.json`);

  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    if (!delegate?.findMany) {
      throw new Error(`알 수 없는 모델: ${model} — MODELS 목록과 schema.prisma 를 맞출 것`);
    }
    const rows = await delegate.findMany();
    data[model] = rows;
    counts[model] = rows.length;
  }

  const payload = {
    _meta: {
      exportedAt: startedAt.toISOString(),
      // 복원 시 스키마가 맞는지 확인할 근거
      schemaModels: MODELS,
      counts,
    },
    data,
  };

  // Date 는 ISO 문자열로, BigInt 는 문자열로 직렬화한다
  fs.writeFileSync(
    outFile,
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
  );

  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`저장: ${outFile}  (${sizeMb} MB)`);
  for (const m of MODELS) console.log(`  ${m.padEnd(20)} ${counts[m]}`);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`합계 ${total} 행`);
  if (total === 0) {
    // 빈 백업을 성공으로 보고하면 정작 필요할 때 쓸모없는 파일만 쌓인다
    console.error('경고: 행이 하나도 없다. 접속 문자열이 올바른지 확인할 것.');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('백업 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
