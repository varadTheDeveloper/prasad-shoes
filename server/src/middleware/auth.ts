import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
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
  token_version: number;
  permissions: Permission[];
}

/** What the server reads from a login token. */
export interface TokenInfo {
  sub: string;
  /** users.token_version when the token was made (missing in tokens from before 16 Nov 2026 = 0) */
  tv?: number;
  /** random id of this one token, so "Log out" can end just this device */
  jti?: string;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser;
      token: TokenInfo;
    }
  }
}

/** A login token for one device. `tokenVersion` = users.token_version now; raising it ends every older token. */
export function signToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ sub: String(userId), tv: tokenVersion, jti: randomBytes(16).toString('base64url') }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${env.jwtDays}d`,
  });
}

export async function loadUser(id: number): Promise<AuthUser | null> {
  const r = await q(
    `SELECT u.id, u.name, u.mobile, u.role, u.is_active, u.must_change_password, u.token_version,
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
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/me', '/api/auth/change-password', '/api/auth/logout']);

/**
 * Checks the token and re-loads the user from the database on EVERY request,
 * so deactivation, permission changes, a password change and Log out apply on the very next action.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization ?? '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Please log in');
    const expired = () => new HttpError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
    let info: TokenInfo;
    try {
      info = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as TokenInfo;
    } catch {
      throw expired();
    }
    const id = Number(info.sub);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw expired();
    const user = await loadUser(id);
    if (!user || !user.is_active) throw new HttpError(401, 'UNAUTHORIZED', 'This account is turned off. Ask the owner.');
    // Password changed / reset since this token was made -> every older token ends.
    if ((info.tv ?? 0) !== user.token_version) throw expired();
    // This one device logged out.
    if (info.jti && (await q(`SELECT 1 FROM revoked_tokens WHERE jti = $1`, [info.jti])).rowCount) throw expired();
    if (user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.originalUrl.split('?')[0])) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please set your own password first');
    }
    req.user = user;
    req.token = info;
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
