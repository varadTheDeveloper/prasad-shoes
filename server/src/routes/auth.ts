import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, q, tx } from '../db';
import { env } from '../env';
import { HttpError, h } from '../errors';
import { loadUser, requireAuth, signToken } from '../middleware/auth';
import { audit } from '../services/audit';
import { mailReady, sendToOwner } from '../services/mailer';
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
    res.json({
      token: signToken(u.id, user.token_version),
      user: mePayload(user),
      permissions: user.permissions,
      mustChangePassword: user.must_change_password,
    });
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
    // token_version + 1: every other device logged in with the old password is logged out.
    const up = await q(
      `UPDATE users SET password_hash = $2, must_change_password = FALSE, token_version = token_version + 1, updated_at = now()
        WHERE id = $1 RETURNING token_version`,
      [req.user.id, hash],
    );
    // This device stays logged in with a fresh token (older app versions ignore it and simply log in again).
    res.json({ token: signToken(req.user.id, up.rows[0].token_version) });
    if (req.user.role === 'ADMIN') sendPasswordChangedAlert('from Change password in the app');
  }),
);

// POST /api/auth/logout – ends this device's login on the server too (not only on the phone).
r.post(
  '/logout',
  requireAuth,
  h(async (req, res) => {
    const t = req.token;
    if (t.jti && t.exp) {
      await q(`INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES ($1, $2, to_timestamp($3)) ON CONFLICT DO NOTHING`, [
        t.jti,
        req.user.id,
        t.exp,
      ]);
    } else {
      // A token from before 16 Nov 2026 has no id of its own: end every older token of this user instead.
      await q(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [req.user.id]);
    }
    await q(`DELETE FROM revoked_tokens WHERE expires_at < now()`); // tidy up: expired tokens fail anyway
    res.status(204).end();
  }),
);

// ------------------------------------------------------------------ Forgot password (owner only)
// The owner asks with their mobile; a one-time link (15 minutes) goes to OWNER_EMAIL (server/.env, the same
// address as "Send to Owner"). The answer is always the same, so nobody can learn which numbers have accounts.
// Staff ask the owner, who resets their password in Staff.
const RESET_MINUTES = 15;
const RESET_LINKS_AT_ONCE = 3; // unused links in the last 15 minutes; more requests send nothing
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const FORGOT_ANSWER = {
  sent: true,
  message: `If this is the owner's mobile number, a reset link has been emailed to the owner. It works once, for ${RESET_MINUTES} minutes.`,
};

r.post(
  '/forgot',
  h(async (req, res) => {
    const { mobile: raw } = z.object({ mobile: z.string().min(1, 'Enter mobile number').max(20) }).parse(req.body ?? {});
    if (!mailReady() || !env.publicUrl) {
      throw new HttpError(503, 'EMAIL_NOT_SET_UP', 'Password reset by email is not set up on the server yet. Ask the developer.');
    }
    const mobile = normaliseMobile(raw);
    if (!mobile) throw new HttpError(400, 'VALIDATION', 'Enter 10 digits', { fields: { mobile: 'Enter 10 digits' } });
    res.json(FORGOT_ANSWER); // same answer for every number, before any work, so the timing tells nothing either

    // After answering: only an active owner gets a link.
    try {
      const { rows } = await q(`SELECT id FROM users WHERE mobile = $1 AND role = 'ADMIN' AND is_active`, [mobile]);
      if (!rows[0]) return;
      const userId = rows[0].id as number;
      const recent = await q(
        `SELECT count(*)::int AS n FROM password_resets
          WHERE user_id = $1 AND used_at IS NULL AND created_at > now() - make_interval(mins => $2)`,
        [userId, RESET_MINUTES],
      );
      if (recent.rows[0].n >= RESET_LINKS_AT_ONCE) return; // someone is pressing it again and again: no more emails
      const key = randomBytes(32).toString('base64url');
      await q(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`, [
        userId,
        sha256(key),
        RESET_MINUTES,
      ]);
      // The key goes after '#': browsers never send that part to the server, so it never lands in server logs.
      const link = `${env.publicUrl}/reset-password#key=${key}`;
      await sendToOwner({
        subject: 'Prasad Shoes – reset the owner password',
        text: [
          'Hello,',
          '',
          'Someone asked to reset the owner password of the Prasad Shoes app.',
          '',
          'To set a new password, open this link:',
          link,
          '',
          `The link works only once and only for ${RESET_MINUTES} minutes.`,
          'If you did not ask for this, ignore this email – the password stays the same.',
          '',
          'Prasad Shoes',
        ].join('\n'),
      });
      await audit(pool, userId, 'PASSWORD_RESET_EMAIL', 'users', userId);
    } catch (e) {
      // No customer details, no key: only what went wrong.
      const err = e as { code?: string; responseCode?: number; message?: string };
      console.error(`[forgot-password] ${err.responseCode ?? ''} ${err.code ?? ''} ${String(err.message ?? '').slice(0, 200)}`);
    }
  }),
);

/** "Your password was changed" email to OWNER_EMAIL, so the owner hears at once if it was not them.
 *  Sent after the answer; a failure is only logged (the password change itself has already happened). */
function sendPasswordChangedAlert(how: string) {
  if (!mailReady()) return;
  const when = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date());
  sendToOwner({
    subject: 'Prasad Shoes – the owner password was changed',
    text: [
      'Hello,',
      '',
      `The owner password of the Prasad Shoes app was changed on ${when} (India time), ${how}.`,
      'Other phones and computers logged in as the owner were logged out.',
      '',
      'If this was you, there is nothing to do.',
      'If this was NOT you: open the app login page, tap "Forgot password?" and set a new password at once,',
      'and check who else can read this email account.',
      '',
      'Prasad Shoes',
    ].join('\n'),
  }).catch((e) => console.error(`[password-alert] ${String((e as Error)?.message ?? e).slice(0, 200)}`));
}

const keyField = z.string().min(20, 'This link is not complete').max(200);
const linkBroken = () => new HttpError(400, 'VALIDATION', 'This link has expired or was already used. Ask for a new one.');

// POST /api/auth/reset-password/check {key} – the reset page asks first, so an old link says so at once.
r.post(
  '/reset-password/check',
  h(async (req, res) => {
    const { key } = z.object({ key: keyField }).parse(req.body ?? {});
    const { rowCount } = await q(
      `SELECT 1 FROM password_resets pr JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now() AND u.is_active AND u.role = 'ADMIN'`,
      [sha256(key)],
    );
    if (!rowCount) throw linkBroken();
    res.json({ ok: true });
  }),
);

// POST /api/auth/reset-password {key, newPassword} – sets the new password; every device is logged out.
r.post(
  '/reset-password',
  h(async (req, res) => {
    const b = z.object({ key: keyField, newPassword: changeBody.shape.newPassword }).parse(req.body ?? {});
    await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT pr.id, pr.user_id FROM password_resets pr JOIN users u ON u.id = pr.user_id
          WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now() AND u.is_active AND u.role = 'ADMIN'
          FOR UPDATE OF pr`,
        [sha256(b.key)],
      );
      if (!rows[0]) throw linkBroken();
      const userId = rows[0].user_id as number;
      const hash = await bcrypt.hash(b.newPassword, 10);
      await c.query(
        `UPDATE users SET password_hash = $2, must_change_password = FALSE, failed_logins = 0, locked_until = NULL,
                token_version = token_version + 1, updated_at = now() WHERE id = $1`,
        [userId, hash],
      );
      // This link and every other open link of this user stop working.
      await c.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
      await audit(c, userId, 'PASSWORD_RESET_DONE', 'users', userId);
    });
    res.status(204).end();
    sendPasswordChangedAlert('with a reset link from email');
  }),
);

export const meRouter = Router();
// GET /api/me – the app calls this after login and on every resume to refresh permissions
meRouter.get('/', requireAuth, (req, res) => res.json(mePayload(req.user)));

export default r;
