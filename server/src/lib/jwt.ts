import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
}

// Read at call time so test setup can override process.env before first use
function accessSecret(): string {
  return process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
}
function refreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
}

export function signAccess(payload: TokenPayload): string {
  return jwt.sign(payload, accessSecret(), { expiresIn: '1h' });
}

export function signRefresh(payload: TokenPayload): string {
  return jwt.sign(payload, refreshSecret(), { expiresIn: '30d' });
}

export function verifyAccess(token: string): TokenPayload {
  return jwt.verify(token, accessSecret()) as TokenPayload;
}

export function verifyRefresh(token: string): TokenPayload {
  return jwt.verify(token, refreshSecret()) as TokenPayload;
}
