import request from 'supertest';
import app from '../src/app';
import { signAccess } from '../src/lib/jwt';
import db from '../src/lib/prisma';

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    careCircle: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    careMember: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// ── inviteService mock ────────────────────────────────────────────────────────

jest.mock('../src/services/inviteService', () => ({
  generateInviteCode: jest.fn(),
  validateInviteCode: jest.fn(),
}));

// Accessors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inviteSvc = require('../src/services/inviteService') as {
  generateInviteCode: jest.Mock;
  validateInviteCode: jest.Mock;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER = { userId: 'owner-1', email: 'owner@example.com' };
const OTHER = { userId: 'other-1', email: 'other@example.com' };

const bearer = (user = OWNER) => `Bearer ${signAccess(user)}`;

const BASE_CIRCLE = {
  id: 'circle-1',
  ownerUserId: OWNER.userId,
  name: '가족 케어',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => jest.clearAllMocks());

// ── POST /care-circles ────────────────────────────────────────────────────────

describe('POST /care-circles', () => {
  it('creates a circle and returns 201', async () => {
    m.careCircle.create.mockResolvedValue(BASE_CIRCLE);

    const res = await request(app)
      .post('/care-circles')
      .set('Authorization', bearer())
      .send({ name: '가족 케어' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'circle-1', name: '가족 케어' });
    expect(m.careCircle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: '가족 케어', ownerUserId: OWNER.userId } }),
    );
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).post('/care-circles').send({ name: '가족' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/care-circles')
      .set('Authorization', bearer())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is blank whitespace', async () => {
    const res = await request(app)
      .post('/care-circles')
      .set('Authorization', bearer())
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

// ── GET /care-circles ─────────────────────────────────────────────────────────

describe('GET /care-circles', () => {
  it('returns list for authenticated user', async () => {
    m.careCircle.findMany.mockResolvedValue([BASE_CIRCLE]);

    const res = await request(app)
      .get('/care-circles')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(m.careCircle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { ownerUserId: OWNER.userId },
            { members: { some: { memberUserId: OWNER.userId } } },
          ],
        },
      }),
    );
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/care-circles');
    expect(res.status).toBe(401);
  });
});

// ── GET /care-circles/:id ─────────────────────────────────────────────────────

describe('GET /care-circles/:id', () => {
  it('returns circle detail for owner', async () => {
    m.careCircle.findUnique.mockResolvedValue({ ...BASE_CIRCLE, members: [], policies: [] });

    const res = await request(app)
      .get('/care-circles/circle-1')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('circle-1');
  });

  it('returns circle detail for a member', async () => {
    m.careCircle.findUnique.mockResolvedValue({
      ...BASE_CIRCLE,
      members: [{ memberUserId: OTHER.userId, role: 'viewer' }],
      policies: [],
    });

    const res = await request(app)
      .get('/care-circles/circle-1')
      .set('Authorization', bearer(OTHER));

    expect(res.status).toBe(200);
  });

  it('returns 403 for a non-member', async () => {
    m.careCircle.findUnique.mockResolvedValue({ ...BASE_CIRCLE, members: [], policies: [] });

    const res = await request(app)
      .get('/care-circles/circle-1')
      .set('Authorization', bearer(OTHER));

    expect(res.status).toBe(403);
  });

  it('returns 404 when circle does not exist', async () => {
    m.careCircle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/care-circles/no-such-id')
      .set('Authorization', bearer());

    expect(res.status).toBe(404);
  });
});

// ── DELETE /care-circles/:id ──────────────────────────────────────────────────

describe('DELETE /care-circles/:id', () => {
  it('owner deletes circle → 204', async () => {
    m.careCircle.findUnique.mockResolvedValue(BASE_CIRCLE);
    m.careCircle.delete.mockResolvedValue(BASE_CIRCLE);

    const res = await request(app)
      .delete('/care-circles/circle-1')
      .set('Authorization', bearer());

    expect(res.status).toBe(204);
    expect(m.careCircle.delete).toHaveBeenCalledWith({ where: { id: 'circle-1' } });
  });

  it('returns 403 for non-owner', async () => {
    m.careCircle.findUnique.mockResolvedValue(BASE_CIRCLE);

    const res = await request(app)
      .delete('/care-circles/circle-1')
      .set('Authorization', bearer(OTHER));

    expect(res.status).toBe(403);
    expect(m.careCircle.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when circle does not exist', async () => {
    m.careCircle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete('/care-circles/no-such-id')
      .set('Authorization', bearer());

    expect(res.status).toBe(404);
  });
});

// ── POST /care-circles/:id/invite ─────────────────────────────────────────────

describe('POST /care-circles/:id/invite', () => {
  it('owner generates invite code → 201', async () => {
    m.careCircle.findUnique.mockResolvedValue(BASE_CIRCLE);
    inviteSvc.generateInviteCode.mockResolvedValue({
      code: 'ABC123',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const res = await request(app)
      .post('/care-circles/circle-1/invite')
      .set('Authorization', bearer());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: 'ABC123' });
    expect(inviteSvc.generateInviteCode).toHaveBeenCalledWith('circle-1');
  });

  it('returns 403 for non-owner', async () => {
    m.careCircle.findUnique.mockResolvedValue(BASE_CIRCLE);

    const res = await request(app)
      .post('/care-circles/circle-1/invite')
      .set('Authorization', bearer(OTHER));

    expect(res.status).toBe(403);
    expect(inviteSvc.generateInviteCode).not.toHaveBeenCalled();
  });
});

// ── POST /care-circles/join ───────────────────────────────────────────────────

describe('POST /care-circles/join', () => {
  it('joins circle with valid code → 201', async () => {
    inviteSvc.validateInviteCode.mockResolvedValue('circle-1');
    m.careMember.findUnique.mockResolvedValue(null);
    m.careMember.create.mockResolvedValue({
      id: 'member-1',
      careCircleId: 'circle-1',
      memberUserId: OTHER.userId,
      role: 'viewer',
    });

    const res = await request(app)
      .post('/care-circles/join')
      .set('Authorization', bearer(OTHER))
      .send({ code: 'ABC123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ careCircleId: 'circle-1', memberUserId: OTHER.userId });
  });

  it('returns 400 for invalid/expired code', async () => {
    const { AppError } = await import('../src/middleware/errorHandler');
    inviteSvc.validateInviteCode.mockRejectedValue(
      new AppError('Invalid or expired invite code', 400),
    );

    const res = await request(app)
      .post('/care-circles/join')
      .set('Authorization', bearer(OTHER))
      .send({ code: 'BADCOD' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when already a member', async () => {
    inviteSvc.validateInviteCode.mockResolvedValue('circle-1');
    m.careMember.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await request(app)
      .post('/care-circles/join')
      .set('Authorization', bearer(OTHER))
      .send({ code: 'ABC123' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(app)
      .post('/care-circles/join')
      .set('Authorization', bearer(OTHER))
      .send({});

    expect(res.status).toBe(400);
  });
});
