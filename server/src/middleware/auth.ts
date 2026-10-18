import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { q } from '../db';
import { HttpError, forbidden } from '../errors';
import { ALL_PERMISSION_CODES, type Permission, type Role } from '../../../shared/permissions';

export interface AuthUser {
  id: number;
  name: string;
  mobile: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  permissions: Permission[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { algorithm: 'HS256', expiresIn: `${env.jwtDays}d` });
}

export async function loadUser(id: number): Promise<AuthUser | null> {
  const r = await q(
    `SELECT u.id, u.name, u.mobile, u.role, u.is_active, u.must_change_password,
            COALESCE(array_agg(up.permission_code) FILTER (WHERE up.permission_code IS NOT NULL), '{}') AS permissions
       FROM users u LEFT JOIN user_permissions up ON up.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [id],
  );
  const u = r.rows[0];
  if (!u) return null;
  if (u.role === 'ADMIN') u.permissions = [...ALL_PERMISSION_CODES];
  return u as AuthUser;
}

/** Paths a user who must change the temporary password can still call. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/me', '/api/auth/change-password']);

/**
 * Checks the token and re-loads the user from the database on EVERY request,
 * so deactivation and permission changes apply on the very next action.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization ?? '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Please log in');
    let sub: string;
    try {
      sub = (jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload).sub as string;
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
    }
    const user = await loadUser(Number(sub));
    if (!user || !user.is_active) throw new HttpError(401, 'UNAUTHORIZED', 'This account is turned off. Ask the owner.');
    if (user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.originalUrl.split('?')[0])) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please set your own password first');
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export const can = (u: AuthUser, code: Permission) => u.role === 'ADMIN' || u.permissions.includes(code);

/** Route guard: user needs at least one of the codes. ADMIN passes always. */
export const requirePermission =
  (...codes: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (codes.some((c) => can(req.user, c))) return next();
    next(forbidden());
  };

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user.role === 'ADMIN') return next();
  next(forbidden('Only the owner can do this'));
};
