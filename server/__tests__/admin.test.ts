import request from 'supertest';
import app from '../src/app';
import { signAccess } from '../src/lib/jwt';
import db from '../src/lib/prisma';

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    user:         { count: jest.fn(), findMany: jest.fn() },
    refreshToken: { findMany: jest.fn() },
    careCircle:   { count: jest.fn(), findMany: jest.fn() },
    careMember:   { findMany: jest.fn() },
    scanUsage:    { findMany: jest.fn() },
    doseEvent:    { groupBy: jest.fn() },
    featureFlag:  { findMany: jest.fn(), upsert: jest.fn() },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;

const ADMIN = { userId: 'admin-1', email: 'admin@example.com', isAdmin: true };
const USER  = { userId: 'user-1',  email: 'user@example.com' };

const bearer = (u: Record<string, unknown> = ADMIN) => `Bearer ${signAccess(u as never)}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const iso     = (n: number) => daysAgo(n).toISOString();

/**
 * user.count 는 한 요청 안에서 네 번 불린다(전체·관리자·주간신규·일정보유).
 * 호출 순서로 목을 잡으면 라우트에 카운트가 하나 늘 때마다 테스트가 깨지므로,
 * where 조건을 보고 분기한다.
 */
interface UserCounts {
  total?: number;
  admins?: number;
  newThisWeek?: number;
  withSchedule?: number;
}

function mockUserCount(counts: UserCounts) {
  m.user.count.mockImplementation(({ where = {} }: { where?: Record<string, unknown> } = {}) => {
    if (where['isAdmin'] === true)   return Promise.resolve(counts.admins ?? 0);
    if (where['schedules'])          return Promise.resolve(counts.withSchedule ?? 0);
    if (where['createdAt'])          return Promise.resolve(counts.newThisWeek ?? 0);
    return Promise.resolve(counts.total ?? 0);
  });
}

/** 기본값 — 각 테스트에서 필요한 부분만 덮어쓴다 */
function stubStats() {
  mockUserCount({});
  m.refreshToken.findMany.mockResolvedValue([]);
  m.careCircle.count.mockResolvedValue(0);
  m.careCircle.findMany.mockResolvedValue([]);
  m.careMember.findMany.mockResolvedValue([]);
  m.scanUsage.findMany.mockResolvedValue([]);
  m.user.findMany.mockResolvedValue([]);
  m.doseEvent.groupBy.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubStats();
});

// ── 접근 제어 ─────────────────────────────────────────────────────────────────

describe('GET /admin/stats — 접근 제어', () => {
  it('Authorization 헤더가 없으면 401', async () => {
    const res = await request(app).get('/admin/stats');
    expect(res.status).toBe(401);
  });

  it('관리자가 아니면 403', async () => {
    const res = await request(app).get('/admin/stats').set('Authorization', bearer(USER));
    expect(res.status).toBe(403);
  });
});

// ── 기존 필드 하위 호환 ───────────────────────────────────────────────────────

describe('GET /admin/stats — 기존 필드', () => {
  it('totalUsers·activeToday·newThisWeek 를 그대로 유지한다', async () => {
    mockUserCount({ total: 100, newThisWeek: 7, withSchedule: 60 });
    m.refreshToken.findMany.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalUsers: 100, activeToday: 2, newThisWeek: 7 });
  });
});

// ── 관리자 계정 제외 ──────────────────────────────────────────────────────────

describe('GET /admin/stats — 관리자 계정 제외', () => {
  it('제외한 관리자 수를 함께 돌려준다', async () => {
    mockUserCount({ total: 40, admins: 2 });

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body).toMatchObject({ totalUsers: 40, excludedAdmins: 2 });
  });

  it('모든 집계 쿼리가 관리자를 걸러낸다', async () => {
    await request(app).get('/admin/stats').set('Authorization', bearer());

    const notAdmin = { isAdmin: false };
    expect(m.user.count).toHaveBeenCalledWith(expect.objectContaining({ where: notAdmin }));
    expect(m.careCircle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { owner: notAdmin } }),
    );
    expect(m.careMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { member: notAdmin } }),
    );
    expect(m.doseEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: notAdmin } }),
    );
    expect(m.scanUsage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user: notAdmin }) }),
    );
    expect(m.refreshToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user: notAdmin }) }),
    );
  });
});

// ── 보호자 그룹 ───────────────────────────────────────────────────────────────

describe('GET /admin/stats — 보호자 그룹', () => {
  it('소유자와 구성원을 합쳐 중복 없이 사용률을 낸다', async () => {
    mockUserCount({ total: 10 });
    m.careCircle.count.mockResolvedValue(2);
    m.careCircle.findMany.mockResolvedValue([
      { ownerUserId: 'patient-1' },
      { ownerUserId: 'patient-2' },
    ]);
    // caregiver-1 이 두 그룹 모두에 속함 (부모님 두 분 관리)
    m.careMember.findMany.mockResolvedValue([
      { memberUserId: 'caregiver-1', careCircleId: 'c1' },
      { memberUserId: 'caregiver-1', careCircleId: 'c2' },
      { memberUserId: 'caregiver-2', careCircleId: 'c1' },
    ]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    // patient-1, patient-2, caregiver-1, caregiver-2 = 4명 / 10명
    expect(res.body.careCircle).toMatchObject({
      circleCount: 2,
      usersInAnyCircle: 4,
      adoptionRate: 0.4,
      caregiverCount: 2,
      avgPatientsPerCaregiver: 1.5, // (2 + 1) / 2
    });
  });

  it('같은 사용자가 소유자이자 다른 그룹의 구성원이어도 한 번만 센다', async () => {
    mockUserCount({ total: 4 });
    m.careCircle.findMany.mockResolvedValue([{ ownerUserId: 'u1' }]);
    m.careMember.findMany.mockResolvedValue([{ memberUserId: 'u1', careCircleId: 'c9' }]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.careCircle.usersInAnyCircle).toBe(1);
    expect(res.body.careCircle.adoptionRate).toBe(0.25);
  });

  it('그룹이 없으면 0으로 나누지 않는다', async () => {
    mockUserCount({ total: 0 });

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.careCircle).toMatchObject({
      usersInAnyCircle: 0,
      adoptionRate: 0,
      caregiverCount: 0,
      avgPatientsPerCaregiver: 0,
    });
  });
});

// ── 스캔 ──────────────────────────────────────────────────────────────────────

describe('GET /admin/stats — 스캔', () => {
  it('총 횟수·고유 사용자·한도 도달 건수를 집계한다', async () => {
    m.scanUsage.findMany.mockResolvedValue([
      { userId: 'u1', count: 5 },  // 한도 도달
      { userId: 'u1', count: 1 },
      { userId: 'u2', count: 2 },
      { userId: 'u3', count: 6 },  // 한도 초과(관리자 등) — 도달로 계산
    ]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.scan).toMatchObject({
      windowDays: 30,
      dailyLimit: 5,
      totalScans: 14,
      uniqueUsers: 3,
      dailyLimitHits: 2,
    });
    expect(res.body.scan.avgScansPerUser).toBeCloseTo(4.67, 2);
  });

  it('스캔 기록이 없으면 평균이 0이다', async () => {
    const res = await request(app).get('/admin/stats').set('Authorization', bearer());
    expect(res.body.scan).toMatchObject({ totalScans: 0, uniqueUsers: 0, avgScansPerUser: 0 });
  });
});

// ── 리텐션 ────────────────────────────────────────────────────────────────────

describe('GET /admin/stats — 리텐션', () => {
  it('가입 후 N일 이후에도 복용 기록이 있으면 잔존으로 센다', async () => {
    m.user.findMany.mockResolvedValue([
      { id: 'kept',    createdAt: daysAgo(40) }, // 40일 전 가입
      { id: 'churned', createdAt: daysAgo(40) },
      { id: 'fresh',   createdAt: daysAgo(3) },  // d7·d30 코호트에 못 들어감
    ]);
    m.doseEvent.groupBy.mockResolvedValue([
      { userId: 'kept',    _max: { takenAt: iso(2) } },   // 가입 38일 뒤까지 활동
      { userId: 'churned', _max: { takenAt: iso(38) } },  // 가입 2일 뒤가 마지막
      { userId: 'fresh',   _max: { takenAt: iso(1) } },
    ]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    // d30: 40일 전 가입자 2명만 대상, 그중 kept 만 잔존
    expect(res.body.retention.d30).toMatchObject({ eligible: 2, retained: 1, rate: 0.5 });
    // d1: 3명 모두 대상 (fresh 도 가입 3일 지남)
    expect(res.body.retention.d1.eligible).toBe(3);
    // d7: 40일 전 가입자 2명만 대상
    expect(res.body.retention.d7.eligible).toBe(2);
  });

  it('복용 기록이 전혀 없는 사용자는 잔존으로 세지 않는다', async () => {
    m.user.findMany.mockResolvedValue([{ id: 'silent', createdAt: daysAgo(40) }]);
    m.doseEvent.groupBy.mockResolvedValue([{ userId: 'silent', _max: { takenAt: null } }]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.retention.d30).toMatchObject({ eligible: 1, retained: 0, rate: 0 });
    expect(res.body.retention.activeLast30d).toBe(0);
  });

  it('대상 코호트가 비면 rate 가 0이다 (0으로 나누지 않음)', async () => {
    m.user.findMany.mockResolvedValue([{ id: 'brand-new', createdAt: daysAgo(0) }]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.retention.d30).toMatchObject({ eligible: 0, retained: 0, rate: 0 });
  });

  it('activeLast7d / activeLast30d 를 마지막 복용 시각으로 센다', async () => {
    m.doseEvent.groupBy.mockResolvedValue([
      { userId: 'a', _max: { takenAt: iso(1) } },
      { userId: 'b', _max: { takenAt: iso(10) } },
      { userId: 'c', _max: { takenAt: iso(45) } },
    ]);

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.retention.activeLast7d).toBe(1);
    expect(res.body.retention.activeLast30d).toBe(2);
  });
});

// ── 활성화 ────────────────────────────────────────────────────────────────────

describe('GET /admin/stats — 활성화', () => {
  it('일정을 만든 사용자 비율을 낸다', async () => {
    mockUserCount({ total: 50, withSchedule: 20 });

    const res = await request(app).get('/admin/stats').set('Authorization', bearer());

    expect(res.body.activation).toMatchObject({ usersWithSchedule: 20, rate: 0.4 });
  });
});
