import request from 'supertest';
import app from '../src/app';
import { signAccess } from '../src/lib/jwt';
import db from '../src/lib/prisma';

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    careCircle: {
      findUnique: jest.fn(),
    },
    doseEventSnapshot: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PATIENT = { userId: 'patient-1', email: 'patient@example.com' };
const GUARDIAN = { userId: 'guardian-1', email: 'guardian@example.com' };
const STRANGER = { userId: 'stranger-1', email: 'stranger@example.com' };

const bearer = (user: { userId: string; email: string }) => `Bearer ${signAccess(user)}`;
const TODAY = new Date().toISOString().slice(0, 10);

const CIRCLE_WITH_GUARDIAN = {
  id: 'circle-1',
  ownerUserId: PATIENT.userId,
  members: [{ memberUserId: GUARDIAN.userId, role: 'viewer' }],
};

const SAMPLE_SNAPSHOT = {
  id: 'snap-1',
  careCircleId: 'circle-1',
  patientId: PATIENT.userId,
  date: TODAY,
  data: { events: [] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const SAMPLE_PAYLOAD = {
  events: [
    {
      id: 'e1',
      status: 'taken',
      plannedAt: `${TODAY}T09:00:00Z`,
      takenAt: `${TODAY}T09:03:00Z`,
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ── PUT /care-circles/:id/members/:userId/today ───────────────────────────────

describe('PUT /care-circles/:id/members/:userId/today', () => {
  it('patient uploads own snapshot → 200', async () => {
    m.careCircle.findUnique.mockResolvedValue(CIRCLE_WITH_GUARDIAN);
    m.doseEventSnapshot.upsert.mockResolvedValue(SAMPLE_SNAPSHOT);

    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT))
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(m.doseEventSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          careCircleId_patientId_date: {
            careCircleId: 'circle-1',
            patientId: PATIENT.userId,
            date: TODAY,
          },
        },
        create: expect.objectContaining({
          careCircleId: 'circle-1',
          patientId: PATIENT.userId,
          date: TODAY,
          data: SAMPLE_PAYLOAD,
        }),
      }),
    );
  });

  it('returns 403 when requester ≠ patientId in URL', async () => {
    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(GUARDIAN))
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(403);
    expect(m.doseEventSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when patient is not in the circle', async () => {
    m.careCircle.findUnique.mockResolvedValue({
      id: 'circle-1',
      ownerUserId: 'someone-else',
      members: [],
    });

    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT))
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(403);
  });

  it('returns 404 when circle does not exist', async () => {
    m.careCircle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/care-circles/no-such/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT))
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(404);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(401);
  });

  it('오프라인 후 재연결 시 최신 데이터로 덮어쓴다 (last-write-wins)', async () => {
    // 1차: 오프라인 중 'scheduled' 상태 스냅샷
    const offline = { ...SAMPLE_SNAPSHOT, data: { events: [{ id: 'e1', status: 'scheduled' }] } };
    // 2차: 온라인 복구 후 'taken' 상태로 업로드
    const online  = { ...SAMPLE_SNAPSHOT, data: { events: [{ id: 'e1', status: 'taken' }] } };

    m.careCircle.findUnique.mockResolvedValue(CIRCLE_WITH_GUARDIAN);
    m.doseEventSnapshot.upsert
      .mockResolvedValueOnce(offline)
      .mockResolvedValueOnce(online);

    // 1차 업로드
    await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT))
      .send({ events: [{ id: 'e1', status: 'scheduled' }] });

    // 2차 업로드 — 이 값이 최종 상태
    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT))
      .send({ events: [{ id: 'e1', status: 'taken' }] });

    expect(res.status).toBe(200);
    // upsert 2회 호출 확인
    expect(m.doseEventSnapshot.upsert).toHaveBeenCalledTimes(2);
    // 두 번째 호출의 update.data 가 최신 상태
    const secondCall = m.doseEventSnapshot.upsert.mock.calls[1][0];
    expect(secondCall.update.data).toEqual({ events: [{ id: 'e1', status: 'taken' }] });
  });
});

// ── 보안: 비구성원 접근 차단 ──────────────────────────────────────────────────
// SharePolicy enforcement (allowedFields 기반 필드 필터링)은 현재 서버에서
// 미구현 상태 — 구성원 여부만 확인하며 스냅샷 전체를 반환한다.
// 관련 TODO: SharePolicy.allowedFields 로 data 필드 필터링 추가 예정.

describe('보안: 비구성원은 스냅샷에 접근할 수 없다', () => {
  it('서클에 속하지 않은 사용자는 PUT 에서 403 을 받는다', async () => {
    m.careCircle.findUnique.mockResolvedValue({
      id: 'circle-1',
      ownerUserId: PATIENT.userId,
      members: [],
    });

    const res = await request(app)
      .put(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(STRANGER))
      .send(SAMPLE_PAYLOAD);

    expect(res.status).toBe(403);
    expect(m.doseEventSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('서클에 속하지 않은 사용자는 GET 에서 403 을 받는다', async () => {
    m.careCircle.findUnique.mockResolvedValue({
      id: 'circle-1',
      ownerUserId: PATIENT.userId,
      members: [],
    });

    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(STRANGER));

    expect(res.status).toBe(403);
    expect(m.doseEventSnapshot.findUnique).not.toHaveBeenCalled();
  });
});

// ── GET /care-circles/:id/members/:userId/today ───────────────────────────────

describe('GET /care-circles/:id/members/:userId/today', () => {
  it('guardian reads patient snapshot → 200', async () => {
    m.careCircle.findUnique.mockResolvedValue(CIRCLE_WITH_GUARDIAN);
    m.doseEventSnapshot.findUnique.mockResolvedValue(SAMPLE_SNAPSHOT);

    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(GUARDIAN));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('snap-1');
    expect(m.doseEventSnapshot.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          careCircleId_patientId_date: {
            careCircleId: 'circle-1',
            patientId: PATIENT.userId,
            date: TODAY,
          },
        },
      }),
    );
  });

  it('patient reads own snapshot → 200', async () => {
    m.careCircle.findUnique.mockResolvedValue(CIRCLE_WITH_GUARDIAN);
    m.doseEventSnapshot.findUnique.mockResolvedValue(SAMPLE_SNAPSHOT);

    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(PATIENT));

    expect(res.status).toBe(200);
  });

  it('returns 404 when no snapshot exists for today', async () => {
    m.careCircle.findUnique.mockResolvedValue(CIRCLE_WITH_GUARDIAN);
    m.doseEventSnapshot.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(GUARDIAN));

    expect(res.status).toBe(404);
  });

  it('returns 403 for stranger not in the circle', async () => {
    m.careCircle.findUnique.mockResolvedValue({
      id: 'circle-1',
      ownerUserId: PATIENT.userId,
      members: [],
    });

    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`)
      .set('Authorization', bearer(STRANGER));

    expect(res.status).toBe(403);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .get(`/care-circles/circle-1/members/${PATIENT.userId}/today`);

    expect(res.status).toBe(401);
  });
});
