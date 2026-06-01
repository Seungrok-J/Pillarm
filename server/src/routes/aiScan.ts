import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

const bodySchema = z.object({
  image: z.string().min(100),
});

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
      "note": "취침 전, 공복 등 특이사항 또는 null"
    }
  ]
}

규칙:
- 여러 약이 있으면 배열에 모두 포함하세요.
- 이미지에서 약 정보를 전혀 찾을 수 없으면 { "results": [] }를 반환하세요.
- JSON 외 다른 텍스트는 포함하지 마세요.`;

router.post('/', async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('이미지 데이터가 필요합니다', 400);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AppError('AI 서비스가 설정되지 않았습니다', 503);

    const client = new Anthropic({ apiKey });

    let text: string;
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: parsed.data.image,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      });
      text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    } catch {
      // 하이쿠 실패 시 소넷으로 재시도
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: parsed.data.image,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      });
      text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new AppError('약봉투 정보를 인식하지 못했습니다', 422);

    const parsed2 = JSON.parse(jsonMatch[0]) as { results: unknown[] };
    if (!Array.isArray(parsed2.results)) throw new AppError('인식 결과를 처리할 수 없습니다', 422);

    res.json({ results: parsed2.results, confidence: 'high' });
  } catch (err) {
    next(err);
  }
});

export default router;
