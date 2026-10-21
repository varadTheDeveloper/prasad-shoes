import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, tx } from '../db';
import { HttpError, h, notFound } from '../errors';
import { requireAdmin } from '../middleware/auth';
import { audit } from '../services/audit';
import { normaliseMobile } from '../../../shared/parser';
import { ALL_PERMISSION_CODES, DEFAULT_STAFF_PERMISSIONS, type Permission } from '../../../shared/permissions';

// Everything here is owner (ADMIN) only.
const r = Router();
r.use(requireAdmin);

const USER_SELECT = `
  SELECT u.id, u.name, u.mobile, u.role, u.is_active, u.must_change_password, u.last_login_at, u.created_at,
         COALESCE(array_agg(up.permission_code ORDER BY p.sort_order) FILTER (WHERE up.permission_code IS NOT NULL), '{}') AS permissions,
         (SELECT count(*)::int FROM orders o WHERE o.created_by = u.id AND o.deleted_at IS NULL
             AND o.created_at >= current_date) AS orders_today
    FROM users u
    LEFT JOIN user_permissions up ON up.user_id = u.id
    LEFT JOIN permissions p ON p.code = up.permission_code`;

async function getUser(id: number) {
  const { rows } = await q(`${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`, [id]);
  return rows[0] ?? null;
}

// GET /api/users – staff with permissions
r.get(
  '/',
  h(async (_req, res) => {
    const { rows } = await q(`${USER_SELECT} GROUP BY u.id ORDER BY u.role, u.is_active DESC, u.name`);
    res.json({ users: rows });
  }),
);

const mobileField = z.string().transform((v, ctx) => {
  const m = normaliseMobile(v);
  if (!m) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile' });
  return m;
});

const createBody = z.object({
  name: z.string().trim().min(1, 'Enter name').max(100),
  mobile: mobileField,
  tempPassword: z.string().min(6, 'At least 6 characters').max(100),
});

// POST /api/users – add staff with the default permissions
r.post(
  '/',
  h(async (req, res) => {
    const b = createBody.parse(req.body);
    const exists = await q(`SELECT 1 FROM users WHERE mobile = $1`, [b.mobile]);
    if (exists.rowCount) throw new HttpError(400, 'VALIDATION', 'This mobile is already added', { fields: { mobile: 'Already added' } });
    const hash = await bcrypt.hash(b.tempPassword, 10);
    const id = await tx(async (c) => {
      const ins = await c.query(
        `INSERT INTO users (name, mobile, password_hash, role, must_change_password, created_by) VALUES ($1,$2,$3,'STAFF',TRUE,$4) RETURNING id`,
        [b.name, b.mobile, hash, req.user.id],
      );
      const id = ins.rows[0].id as number;
      await c.query(
        `INSERT INTO user_permissions (user_id, permission_code, granted_by) SELECT $1, unnest($2::text[]), $3`,
        [id, DEFAULT_STAFF_PERMISSIONS, req.user.id],
      );
      await audit(c, req.user.id, 'STAFF_ADD', 'users', id, null, { name: b.name, mobile: b.mobile, permissions: DEFAULT_STAFF_PERMISSIONS });
      return id;
    });
    res.status(201).json(await getUser(id));
  }),
);

const patchBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(6, 'At least 6 characters').max(100).optional(),
});

// PATCH /api/users/:id – rename, deactivate / re-activate, reset password
r.patch(
  '/:id(\\d+)',
  h(async (req, res) => {
    const id = Number(req.params.id);
    const b = patchBody.parse(req.body);
    const before = await getUser(id);
    if (!before) throw notFound('Staff not found');
    if (before.role === 'ADMIN' && (b.isActive === false || b.resetPassword)) {
      throw new HttpError(400, 'VALIDATION', 'The owner account cannot be turned off or reset here');
    }
    await tx(async (c) => {
      if (b.name !== undefined && b.name !== before.name) {
        await c.query(`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, [id, b.name]);
        await audit(c, req.user.id, 'STAFF_EDIT', 'users', id, { name: before.name }, { name: b.name });
      }
      if (b.isActive !== undefined && b.isActive !== before.is_active) {
        await c.query(`UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1`, [id, b.isActive]);
        await audit(c, req.user.id, b.isActive ? 'STAFF_ACTIVATE' : 'STAFF_DEACTIVATE', 'users', id);
      }
      if (b.resetPassword) {
        const hash = await bcrypt.hash(b.resetPassword, 10);
        await c.query(
          `UPDATE users SET password_hash = $2, must_change_password = TRUE, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1`,
          [id, hash],
        );
        await audit(c, req.user.id, 'PASSWORD_RESET', 'users', id);
      }
    });
    res.json(await getUser(id));
  }),
);

const permsBody = z.object({ codes: z.array(z.enum(ALL_PERMISSION_CODES as [Permission, ...Permission[]])) });

// PUT /api/users/:id/permissions – replace the full list
r.put(
  '/:id(\\d+)/permissions',
  h(async (req, res) => {
    const id = Number(req.params.id);
    const { codes } = permsBody.parse(req.body);
    const before = await getUser(id);
    if (!before) throw notFound('Staff not found');
    if (before.role === 'ADMIN') throw new HttpError(400, 'VALIDATION', 'The owner always has every permission');
    const want = new Set(codes);
    const had = new Set<string>(before.permissions);
    const grant = [...want].filter((c) => !had.has(c));
    const revoke = [...had].filter((c) => !want.has(c as Permission));
    await tx(async (c) => {
      if (revoke.length) await c.query(`DELETE FROM user_permissions WHERE user_id = $1 AND permission_code = ANY($2::text[])`, [id, revoke]);
      if (grant.length) {
        await c.query(`INSERT INTO user_permissions (user_id, permission_code, granted_by) SELECT $1, unnest($2::text[]), $3`, [id, grant, req.user.id]);
      }
      for (const g of grant) await audit(c, req.user.id, 'PERMISSION_GRANT', 'users', id, null, { code: g });
      for (const v of revoke) await audit(c, req.user.id, 'PERMISSION_REVOKE', 'users', id, { code: v }, null);
    });
    res.json({ permissions: (await getUser(id)).permissions });
  }),
);

export const permissionsRouter = Router();
// GET /api/permissions – the 9 permissions with labels, groups, defaults
permissionsRouter.get(
  '/',
  requireAdmin,
  h(async (_req, res) => {
    const { rows } = await q(`SELECT code, label, group_name, default_on FROM permissions ORDER BY sort_order`);
    res.json({ permissions: rows });
  }),
);

export default r;
