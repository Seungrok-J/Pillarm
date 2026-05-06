/**
 * /sync 라우트 통합 테스트
 *
 * AC1 — GET /sync/pull : 사용자 데이터 전체 / 증분 다운로드
 * AC2 — POST /sync/push : 대량 업로드 후 synced 카운트 반환
 * AC3 — PUT /sync/medications/:id : 단일 medication upsert
 * AC4 — PUT /sync/schedules/:id : 단일 schedule upsert
 * AC5 — PUT /sync/dose-events/:id : 단일 dose event upsert
 * AC6 — 인증 없이 접근하면 401
 */

import request from 'supertest';
import app from '../src/app';
import { signAccess } from '../src/lib/jwt';
import db from '../src/lib/prisma';

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    medication: {
      findMany: jest.fn(),
      upsert:   jest.fn(),
    },
    schedule: {
      findMany: jest.fn(),
      upsert:   jest.fn(),
    },
    doseEvent: {
      findMany: jest.fn(),
      upsert:   jest.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER = { userId: 'user-1', email: 'alice@example.com' };
const bearer = () => `Bearer ${signAccess(USER)}`;

const MED = {
  id: 'med-1', userId: USER.userId, name: '혈압약',
  dosageValue: 500, dosageUnit: 'mg', color: '#3b82f6',
  isActive: true, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
};

const SCHED = {
  id: 'sched-1', userId: USER.userId, medicationId: 'med-1',
  scheduleType: 'fixed', startDate: '2026-04-01',
  times: ['08:00', '20:00'], daysOfWeek: [], withFood: 'none',
  graceMinutes: 120, isActive: true,
  createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
};

const EVT = {
  id: 'evt-1', userId: USER.userId, scheduleId: 'sched-1', medicationId: 'med-1',
  plannedAt: '2026-04-23T08:00:00', status: 'taken',
  takenAt: '2026-04-23T08:05:00', snoozeCount: 0, source: 'notification',
  createdAt: '2026-04-23T00:00:00Z', updatedAt: '2026-04-23T08:05:00Z',
};

beforeEach(() => jest.clearAllMocks());

// ── AC6 — 인증 없으면 401 ─────────────────────────────────────────────────────

describe('인증 없이 접근', () => {
  it('GET /sync/pull → 401', async () => {
    const res = await request(app).get('/sync/pull');
    expect(res.status).toBe(401);
  });

  it('POST /sync/push → 401', async () => {
    const res = await request(app).post('/sync/push').send({});
    expect(res.status).toBe(401);
  });

  it('PUT /sync/medications/:id → 401', async () => {
    const res = await request(app).put('/sync/medications/med-1').send(MED);
    expect(res.status).toBe(401);
  });
});

// ── AC1 — GET /sync/pull ──────────────────────────────────────────────────────

describe('GET /sync/pull', () => {
  it('전체 데이터를 반환한다', async () => {
    m.medication.findMany.mockResolvedValue([MED]);
    m.schedule.findMany.mockResolvedValue([SCHED]);
    m.doseEvent.findMany.mockResolvedValue([EVT]);

    const res = await request(app)
      .get('/sync/pull')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(1);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.doseEvents).toHaveLength(1);
    expect(res.body.medications[0].id).toBe('med-1');
  });

  it('since 파라미터가 있으면 findMany에 updatedAt 필터가 포함된다', async () => {
    m.medication.findMany.mockResolvedValue([]);
    m.schedule.findMany.mockResolvedValue([]);
    m.doseEvent.findMany.mockResolvedValue([]);

    const since = '2026-04-22T00:00:00Z';
    const res = await request(app)
      .get(`/sync/pull?since=${encodeURIComponent(since)}`)
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(m.medication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ updatedAt: { gt: since } }),
      }),
    );
  });

  it('since가 유효하지 않은 날짜면 400 반환', async () => {
    const res = await request(app)
      .get('/sync/pull?since=not-a-date')
      .set('Authorization', bearer());

    expect(res.status).toBe(400);
  });
});

// ── AC2 — POST /sync/push ─────────────────────────────────────────────────────

describe('POST /sync/push', () => {
  it('대량 업로드 후 synced 카운트를 반환한다', async () => {
    m.medication.upsert.mockResolvedValue(MED);
    m.schedule.upsert.mockResolvedValue(SCHED);
    m.doseEvent.upsert.mockResolvedValue(EVT);

    const res = await request(app)
      .post('/sync/push')
      .set('Authorization', bearer())
      .send({ medications: [MED], schedules: [SCHED], doseEvents: [EVT] });

    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual({ medications: 1, schedules: 1, doseEvents: 1 });
    expect(m.medication.upsert).toHaveBeenCalledTimes(1);
    expect(m.schedule.upsert).toHaveBeenCalledTimes(1);
    expect(m.doseEvent.upsert).toHaveBeenCalledTimes(1);
  });

  it('빈 배열이면 upsert를 호출하지 않는다', async () => {
    const res = await request(app)
      .post('/sync/push')
      .set('Authorization', bearer())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toEqual({ medications: 0, schedules: 0, doseEvents: 0 });
    expect(m.medication.upsert).not.toHaveBeenCalled();
  });

  it('medications, schedules, doseEvents 각각 userId가 주입된다', async () => {
    m.medication.upsert.mockResolvedValue(MED);
    m.schedule.upsert.mockResolvedValue(SCHED);
    m.doseEvent.upsert.mockResolvedValue(EVT);

    await request(app)
      .post('/sync/push')
      .set('Authorization', bearer())
      .send({ medications: [MED] });

    expect(m.medication.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: USER.userId }),
      }),
    );
  });
});

// ── AC3 — PUT /sync/medications/:id ──────────────────────────────────────────

describe('PUT /sync/medications/:id', () => {
  it('medication을 upsert하고 반환한다', async () => {
    m.medication.upsert.mockResolvedValue(MED);

    const res = await request(app)
      .put('/sync/medications/med-1')
      .set('Authorization', bearer())
      .send(MED);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('med-1');
    expect(m.medication.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'med-1' } }),
    );
  });

  it('name 없으면 400 반환', async () => {
    const res = await request(app)
      .put('/sync/medications/med-1')
      .set('Authorization', bearer())
      .send({ id: 'med-1' });

    expect(res.status).toBe(400);
  });
});

// ── AC4 — PUT /sync/schedules/:id ────────────────────────────────────────────

describe('PUT /sync/schedules/:id', () => {
  it('schedule을 upsert하고 반환한다', async () => {
    m.schedule.upsert.mockResolvedValue(SCHED);

    const res = await request(app)
      .put('/sync/schedules/sched-1')
      .set('Authorization', bearer())
      .send(SCHED);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('sched-1');
  });

  it('medicationId 없으면 400 반환', async () => {
    const res = await request(app)
      .put('/sync/schedules/sched-1')
      .set('Authorization', bearer())
      .send({ id: 'sched-1' });

    expect(res.status).toBe(400);
  });
});

// ── AC5 — PUT /sync/dose-events/:id ──────────────────────────────────────────

describe('PUT /sync/dose-events/:id', () => {
  it('dose event를 upsert하고 반환한다', async () => {
    m.doseEvent.upsert.mockResolvedValue(EVT);

    const res = await request(app)
      .put('/sync/dose-events/evt-1')
      .set('Authorization', bearer())
      .send(EVT);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('evt-1');
    expect(m.doseEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'evt-1' } }),
    );
  });

  it('scheduleId 없으면 400 반환', async () => {
    const res = await request(app)
      .put('/sync/dose-events/evt-1')
      .set('Authorization', bearer())
      .send({ id: 'evt-1' });

    expect(res.status).toBe(400);
  });
});
