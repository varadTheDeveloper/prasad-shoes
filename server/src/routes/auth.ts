import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q } from '../db';
import { HttpError, h } from '../errors';
import { loadUser, requireAuth, signToken } from '../middleware/auth';
import { normaliseMobile } from '../../../shared/parser';

const r = Router();

const MAX_TRIES = 5;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const LOCK_MINUTES = 15;

const loginBody = z.object({ mobile: z.string().min(1, 'Enter mobile number'), password: z.string().min(1, 'Enter password') });

function mePayload(u: NonNullable<Awaited<ReturnType<typeof loadUser>>>) {
  return { id: u.id, name: u.name, mobile: u.mobile, role: u.role, permissions: u.permissions, mustChangePassword: u.must_change_password };
}

// POST /api/auth/login
r.post(
  '/login',
  h(async (req, res) => {
    const body = loginBody.parse(req.body);
    const mobile = normaliseMobile(body.mobile);
    const wrong = new HttpError(401, 'UNAUTHORIZED', 'Mobile or password is wrong');
    if (!mobile) throw wrong;

    const { rows } = await q(`SELECT id, password_hash, is_active, failed_logins, locked_until FROM users WHERE mobile = $1`, [mobile]);
    const u = rows[0];
    if (!u) {
      await bcrypt.compare(body.password, DUMMY_HASH); // same timing as a real check
      throw wrong;
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      throw new HttpError(423, 'LOCKED', `Too many wrong tries. Try again after ${LOCK_MINUTES} minutes.`);
    }
    const ok = await bcrypt.compare(body.password, u.password_hash);
    if (!ok) {
      const tries = (u.locked_until ? 0 : u.failed_logins) + 1; // a finished lock starts a fresh count
      if (tries >= MAX_TRIES) {
        await q(`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1`, [u.id, LOCK_MINUTES]);
      } else {
        await q(`UPDATE users SET failed_logins = $2, locked_until = NULL WHERE id = $1`, [u.id, tries]);
      }
      if (tries >= MAX_TRIES) throw new HttpError(423, 'LOCKED', `Too many wrong tries. Try again after ${LOCK_MINUTES} minutes.`);
      throw wrong;
    }
    if (!u.is_active) throw new HttpError(401, 'UNAUTHORIZED', 'This account is turned off. Ask the owner.');

    await q(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [u.id]);
    const user = (await loadUser(u.id))!;
    res.json({ token: signToken(u.id), user: mePayload(user), permissions: user.permissions, mustChangePassword: user.must_change_password });
  }),
);

const changeBody = z.object({
  oldPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(6, 'At least 6 characters').max(100),
});

// POST /api/auth/change-password
r.post(
  '/change-password',
  requireAuth,
  h(async (req, res) => {
    const body = changeBody.parse(req.body);
    const { rows } = await q(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!(await bcrypt.compare(body.oldPassword, rows[0].password_hash))) {
      throw new HttpError(400, 'VALIDATION', 'Current password is wrong', { fields: { oldPassword: 'Current password is wrong' } });
    }
    if (body.oldPassword === body.newPassword) {
      throw new HttpError(400, 'VALIDATION', 'Choose a different password', { fields: { newPassword: 'Must be different from the old password' } });
    }
    const hash = await bcrypt.hash(body.newPassword, 10);
    await q(`UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = now() WHERE id = $1`, [req.user.id, hash]);
    res.status(204).end();
  }),
);

export const meRouter = Router();
// GET /api/me – the app calls this after login and on every resume to refresh permissions
meRouter.get('/', requireAuth, (req, res) => res.json(mePayload(req.user)));

export default r;
