import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'LOCKED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'SERVER';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, 'NOT_FOUND', what);
export const forbidden = (msg = 'You do not have permission for this. Ask the owner.') => new HttpError(403, 'FORBIDDEN', msg);

/** Wrap async route handlers so thrown errors reach the error handler. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) {
      const k = i.path.join('.') || '_';
      if (!fields[k]) fields[k] = i.message;
    }
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Please check the highlighted fields', fields } });
  }
  if (err && typeof err === 'object' && 'type' in err && (err as any).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Bad JSON' } });
  }
  // Never log request bodies: they contain customer names, addresses and phones.
  console.error('[error]', (err as Error)?.message ?? err);
  return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong on the server' } });
}
