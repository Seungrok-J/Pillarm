import request from 'supertest';
import app from '../src/app';
import { signAccess } from '../src/lib/jwt';
import db from '../src/lib/prisma';

process.env.ANTHROPIC_API_KEY = 'test-key';

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    scanUsage: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// ── Anthropic mock ───────────────────────────────────────────────────────────

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;

const USER = { userId: 'user-1', email: 'user@example.com' };
const bearer = `Bearer ${signAccess(USER)}`;

const SAMPLE_RESPONSE = {
  content: [{ type: 'text', text: '{"results":[{"medicationName":"타이레놀"}]}' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue(SAMPLE_RESPONSE);
});

describe('POST /ai/scan-medication — 일일 호출 제한', () => {
  it('increment 선점 후 5회 이내면 호출을 허용한다', async () => {
    m.scanUsage.upsert.mockResolvedValue({ count: 5 }); // 이번 요청으로 5회째

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // 원자적 선점 — Claude 호출 전에 increment 가 먼저 일어난다
    expect(m.scanUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { count: { increment: 1 } },
        create: expect.objectContaining({ userId: USER.userId, count: 1 }),
      }),
    );
  });

  it('선점 결과가 한도를 초과하면 429를 반환하고 Claude를 호출하지 않는다', async () => {
    m.scanUsage.upsert.mockResolvedValue({ count: 6 }); // 이미 5회 소진 후 6회째

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('5회');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('오늘 첫 호출(레코드 없음)은 허용된다', async () => {
    m.scanUsage.upsert.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('AI 호출이 모두 실패하면 선점한 사용 횟수를 되돌린다', async () => {
    m.scanUsage.upsert.mockResolvedValue({ count: 2 });
    m.scanUsage.update.mockResolvedValue({ count: 1 });
    mockCreate.mockRejectedValue(new Error('api down')); // 하이쿠·소넷 모두 실패

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(500);
    expect(m.scanUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { count: { decrement: 1 } } }),
    );
  });

  it('인증 없이 요청하면 401', async () => {
    const res = await request(app)
      .post('/ai/scan-medication')
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(401);
  });
});
