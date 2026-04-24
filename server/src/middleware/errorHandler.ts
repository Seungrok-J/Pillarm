import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.error('[unhandled]', err);
  }
  res.status(500).json({ error: 'Internal server error' });
}
