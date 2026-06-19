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
      findUnique: jest.fn(),
      upsert: jest.fn(),
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
  it('오늘 사용량이 4회면 호출을 허용하고 5회로 증가시킨다', async () => {
    m.scanUsage.findUnique.mockResolvedValue({ count: 4 });
    m.scanUsage.upsert.mockResolvedValue({ count: 5 });

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(m.scanUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { count: { increment: 1 } },
        create: expect.objectContaining({ userId: USER.userId, count: 1 }),
      }),
    );
  });

  it('오늘 사용량이 5회면 429와 안내 메시지를 반환하고 Claude를 호출하지 않는다', async () => {
    m.scanUsage.findUnique.mockResolvedValue({ count: 5 });

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('5회');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(m.scanUsage.upsert).not.toHaveBeenCalled();
  });

  it('오늘 첫 호출(레코드 없음)은 허용된다', async () => {
    m.scanUsage.findUnique.mockResolvedValue(null);
    m.scanUsage.upsert.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/ai/scan-medication')
      .set('Authorization', bearer)
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('인증 없이 요청하면 401', async () => {
    const res = await request(app)
      .post('/ai/scan-medication')
      .send({ image: 'a'.repeat(200) });

    expect(res.status).toBe(401);
  });
});
