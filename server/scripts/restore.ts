/**
 * `backup.ts` 가 만든 JSON 을 DB 로 되돌린다.
 *
 *   cd server
 *   DATABASE_URL="<대상 접속 문자열>" npx tsx scripts/restore.ts <백업파일> [--yes]
 *
 * 기본은 **드라이런**이다. 무엇이 들어갈지 출력만 하고 아무것도 쓰지 않는다.
 * 실제로 쓰려면 `--yes` 를 붙인다.
 *
 * 삽입 순서는 외래키 의존성을 따른다(User → 나머지). 각 행은 upsert 이므로
 * 부분 복원이나 재실행이 안전하다 — 이미 있는 행은 덮어쓴다.
 *
 * **기존 행을 지우지 않는다.** 백업에 없는 행은 그대로 남는다.
 * 완전히 동일한 상태로 되돌리려면 빈 DB 에 복원할 것.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

/** 외래키 의존 순서 — 이 순서를 바꾸면 참조 무결성 오류가 난다 */
const ORDER = [
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

/** id 대신 복합 키를 쓰는 모델 */
const WHERE_KEY: Record<string, (row: Record<string, unknown>) => Record<string, unknown>> = {
  featureFlag: (r) => ({ key: r['key'] }),
};

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--yes');
  if (!file) throw new Error('사용법: restore.ts <백업파일> [--yes]');

  const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    _meta?: { exportedAt?: string; counts?: Record<string, number> };
    data: Record<string, Record<string, unknown>[]>;
  };
  if (!payload.data) throw new Error('형식이 올바르지 않다: data 키가 없다');

  console.log(`백업 파일: ${file}`);
  console.log(`생성 시각: ${payload._meta?.exportedAt ?? '(불명)'}`);
  console.log(apply ? '모드: 실제 적용' : '모드: 드라이런 (쓰기 없음, --yes 로 실행)');
  console.log('');

  let written = 0;
  let failed = 0;

  for (const model of ORDER) {
    const rows = payload.data[model] ?? [];
    if (rows.length === 0) { console.log(`  ${model.padEnd(20)} 0`); continue; }

    if (!apply) { console.log(`  ${model.padEnd(20)} ${rows.length} (예정)`); continue; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    let ok = 0;
    for (const row of rows) {
      const where = WHERE_KEY[model] ? WHERE_KEY[model](row) : { id: row['id'] };
      try {
        await delegate.upsert({ where, update: row, create: row });
        ok++;
      } catch (err) {
        failed++;
        // 한 행이 실패해도 나머지는 계속 복원한다 — 부분 복구가 전무보다 낫다
        console.error(`    ! ${model} ${JSON.stringify(where)}: ${(err as Error).message.split('\n')[0]}`);
      }
    }
    written += ok;
    console.log(`  ${model.padEnd(20)} ${ok}/${rows.length}`);
  }

  console.log('');
  if (!apply) {
    console.log('드라이런 종료 — 실제로 복원하려면 --yes 를 붙여 다시 실행할 것.');
  } else {
    console.log(`복원 ${written} 행${failed ? `, 실패 ${failed} 행` : ''}`);
    if (failed) process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('복원 실패:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
