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
