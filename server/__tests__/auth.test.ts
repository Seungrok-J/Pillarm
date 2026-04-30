import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app';
import { signRefresh } from '../src/lib/jwt';
import db from '../src/lib/prisma';

// ── Prisma mock ───────────────────────────────────────────────────────────────
// jest.mock is hoisted — factory runs before variable declarations, so mock
// objects must be defined inline inside the factory.

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_pw'),
  compare: jest.fn(),
}));

// Typed accessors to the mocked module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = db as any;
const mockedCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_USER = { id: 'user-1', email: 'alice@example.com', passwordHash: 'hashed_pw' };
const BASE_RT = {
  id: 'rt-1',
  userId: 'user-1',
  token: 'stored-refresh',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ── POST /auth/signup ─────────────────────────────────────────────────────────

describe('POST /auth/signup', () => {
  it('creates user and returns tokens (201)', async () => {
    m.user.findUnique.mockResolvedValue(null);
    m.user.create.mockResolvedValue(BASE_USER);
    m.refreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      userId: 'user-1',
    });
    expect(m.user.create).toHaveBeenCalledTimes(1);
    expect(m.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when ready exists', async () => {
    m.user.findUnique.mockResolvedValue(BASE_USER);

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/i);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'alice@example.com', password: 'short' });

    expect(res.status).toBe(400);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns tokens for valid credentials (200)', async () => {
    m.user.findUnique.mockResolvedValue(BASE_USER);
    mockedCompare.mockResolvedValue(true as never);
    m.refreshToken.create.mockResolvedValue({});
    m.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      userId: 'user-1',
    });
  });

  it('returns 401 for wrong password', async () => {
    m.user.findUnique.mockResolvedValue(BASE_USER);
    mockedCompare.mockResolvedValue(false as never);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for unknown email', async () => {
    m.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('persists fcmToken when provided', async () => {
    m.user.findUnique.mockResolvedValue(BASE_USER);
    mockedCompare.mockResolvedValue(true as never);
    m.refreshToken.create.mockResolvedValue({});
    m.user.update.mockResolvedValue({});

    await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'password123', fcmToken: 'fcm-abc' });

    expect(m.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { fcmToken: 'fcm-abc' } }),
    );
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('issues new token pair for valid refresh token (200)', async () => {
    const validToken = signRefresh({ userId: 'user-1', email: 'alice@example.com' });
    m.refreshToken.findUnique.mockResolvedValue({ ...BASE_RT, token: validToken });
    m.refreshToken.delete.mockResolvedValue({});
    m.refreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validToken });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(m.refreshToken.delete).toHaveBeenCalledWith({ where: { token: validToken } });
    expect(m.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for malformed JWT', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'not.a.jwt' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when token is not in DB (already rotated)', async () => {
    const validToken = signRefresh({ userId: 'user-1', email: 'alice@example.com' });
    m.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validToken });

    expect(res.status).toBe(401);
  });

  it('returns 401 when DB record is past expiresAt', async () => {
    const validToken = signRefresh({ userId: 'user-1', email: 'alice@example.com' });
    m.refreshToken.findUnique.mockResolvedValue({
      ...BASE_RT,
      token: validToken,
      expiresAt: new Date(Date.now() - 1_000),
    });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: validToken });

    expect(res.status).toBe(401);
  });
});
