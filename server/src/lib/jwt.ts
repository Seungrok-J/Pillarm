import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId:  string;
  email:   string;
  isAdmin?: boolean;
}

// Read at call time so test setup can override process.env before first use.
// Missing secrets cause an immediate crash — never fall back to known-weak values.
function accessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set. Set it before starting the server.');
  return s;
}
function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET is not set. Set it before starting the server.');
  return s;
}

export function signAccess(payload: TokenPayload): string {
  return jwt.sign(payload, accessSecret(), { expiresIn: '15m' });
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

// ── 계정 연결 임시 토큰 (10분 유효) ──────────────────────────────────────────

export interface LinkTokenPayload {
  provider:   string;
  providerId: string;
  email?:     string;
  name?:      string;
}

export function signLinkToken(payload: LinkTokenPayload): string {
  return jwt.sign(payload, accessSecret(), { expiresIn: '10m' });
}

export function verifyLinkToken(token: string): LinkTokenPayload {
  return jwt.verify(token, accessSecret()) as LinkTokenPayload;
}
