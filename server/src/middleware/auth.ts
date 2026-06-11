import { Request, Response, NextFunction } from 'express';
import { verifyAccess, type TokenPayload } from '../lib/jwt';
import { AppError } from './errorHandler';

// Augment Express Request so downstream handlers have typed req.user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    next(new AppError('Authorization required', 401));
    return;
  }
  try {
    req.user = verifyAccess(auth.slice(7));
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

/** requireAuth를 먼저 통과한 뒤 isAdmin 여부를 검증한다 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user?.isAdmin) {
      return next(new AppError('Admin access required', 403));
    }
    next();
  });
}
