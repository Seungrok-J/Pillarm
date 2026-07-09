import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

// ~10 MB base64 상한 (실제 이미지 ~7.5 MB 해당)
const bodySchema = z.object({
  image: z.string().min(100).max(10_000_000),
});

const DAILY_SCAN_LIMIT = 5;

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AppError('AI 서비스가 설정되지 않았습니다', 503);
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

const PROMPT = `한국 조제약 봉투 또는 일반의약품 포장 이미지에서 복약 정보를 추출해주세요.

다음 JSON 형식으로 정확하게 응답하세요. 인식할 수 없는 필드는 null로 반환하세요.

{
  "results": [
    {
      "medicationName": "약 이름 (필수, 상품명 또는 성분명)",
      "dosageValue": 숫자 또는 null,
      "dosageUnit": "mg|g|정|캡슐|mL 중 하나 또는 null",
      "timesPerDay": 하루 복용 횟수 숫자 또는 null,
      "dosePerIntake": "1정 등 문자열 또는 null",
      "durationDays": 복용 일수 숫자 또는 null,
      "withFood": "before(식전)|after(식후)|none(무관) 중 하나 또는 null",
      "mealSlots": ["morning","lunch","dinner","bedtime"] 중 복용 시점에 해당하는 것들의 배열 또는 null (예: 아침저녁 2회→["morning","dinner"], 아침점심저녁 3회→["morning","lunch","dinner"], 취침전→["bedtime"]),
      "withFoodMinutes": 식사 기준 복용 시간 간격(분) 숫자 또는 null (식후30분→30, 식전30분→-30, 식후즉시→0, 식전→-30, 식후→30, 무관→0),
      "note": "취침 전, 공복 등 특이사항 또는 null"
    }
  ]
}

규칙:
- 여러 약이 있으면 배열에 모두 포함하세요.
- 이미지에서 약 정보를 전혀 찾을 수 없으면 { "results": [] }를 반환하세요.
- JSON 외 다른 텍스트는 포함하지 마세요.`;

const imageContent = (data: string) => [
  {
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
  },
  { type: 'text' as const, text: PROMPT },
];

router.post('/', async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('이미지 데이터가 필요합니다', 400);

    const userId = req.user!.userId;
    const date = todayKST();

    const client = getClient(); // 503 은 사용 횟수 선점 전에 확인

    // 사용 횟수를 원자적으로 선점 — 조회 후 검사·증가 방식은
    // 동시 요청이 같은 count 를 읽어 일일 한도를 우회할 수 있다.
    const usage = await prisma.scanUsage.upsert({
      where: { userId_date: { userId, date } },
      update: { count: { increment: 1 } },
      create: { userId, date, count: 1 },
    });
    if (usage.count > DAILY_SCAN_LIMIT) {
      throw new AppError(
        `오늘 약봉투 분석 횟수(${DAILY_SCAN_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해주세요.`,
        429,
      );
    }

    let text: string;
    let confidence: 'high' | 'medium' = 'high';

    try {
      try {
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: imageContent(parsed.data.image) }],
        });
        text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
      } catch {
        // 하이쿠 실패 시 소넷으로 재시도 — 신뢰도를 medium으로 낮춤
        confidence = 'medium';
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: imageContent(parsed.data.image) }],
        });
        text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
      }
    } catch (err) {
      // AI 호출 자체가 실패하면 선점했던 사용 횟수를 되돌린다
      await prisma.scanUsage
        .update({
          where: { userId_date: { userId, date } },
          data: { count: { decrement: 1 } },
        })
        .catch(() => {});
      throw err;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new AppError('약봉투 정보를 인식하지 못했습니다', 422);

    let parsed2: { results: unknown[] };
    try {
      parsed2 = JSON.parse(jsonMatch[0]) as { results: unknown[] };
    } catch {
      throw new AppError('인식 결과를 처리할 수 없습니다', 422);
    }
    if (!Array.isArray(parsed2.results)) throw new AppError('인식 결과를 처리할 수 없습니다', 422);

    res.json({ results: parsed2.results, confidence });
  } catch (err) {
    next(err);
  }
});

export default router;
