import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { q, tx } from '../db';
import { HttpError, forbidden, h, notFound } from '../errors';
import { can, requireAdmin, requirePermission, type AuthUser } from '../middleware/auth';
import { audit } from '../services/audit';
import { normaliseForHash, normaliseMobile } from '../../../shared/parser';
import { DEFAULT_PAYMENT, effectivePayment } from '../../../shared/features';

const r = Router();

// ------------------------------------------------------------------ validation
const opt = (max: number) =>
  z
    .string()
    .max(max, `At most ${max} characters`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const mobile = (required: boolean) =>
  z
    .string()
    .nullish()
    .transform((v, ctx) => {
      if (!v || !v.trim()) {
        if (required) ctx.addIssue({ code: 'custom', message: 'Enter mobile number' });
        return null;
      }
      const m = normaliseMobile(v);
      if (!m) ctx.addIssue({ code: 'custom', message: 'Enter 10 digits' });
      return m || null;
    });

const fields = {
  ship_name: z.string().trim().min(1, 'Enter name').max(120),
  address: z.string().trim().min(1, 'Enter address'),
  landmark: opt(200),
  district: opt(100),
  state: opt(60),
  pincode: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[1-9][0-9]{5}$/, '6 digits, not starting with 0')),
  mobile1: mobile(true),
  mobile2: mobile(false),
  product_name: opt(150),
  size: opt(20),
  note: opt(250),
  // While COD is switched off (shared/features.ts) every order is stored as PREPAID.
  payment_type: z.enum(['COD', 'PREPAID']).default(DEFAULT_PAYMENT).transform(effectivePayment),
  // Optional: blank ('' / null / missing) is saved as blank.
  amount: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number('Amount must be a number').min(0, 'Amount cannot be negative').max(10_000_000).nullable(),
  ).optional(),
};

const createBody = z.object({
  ...fields,
  raw_message: z.string().max(20_000).default(''),
  client_request_id: z.uuid('Missing request id'),
  force: z.boolean().optional(),
});

/** Parse a new order and report every wrong field at once. Amount is needed only for COD. */
function parseCreate(body: any) {
  const res = createBody.safeParse(body);
  const errs: Record<string, string> = {};
  if (!res.success) for (const i of res.error.issues) errs[i.path.join('.')] ??= i.message;
  if (effectivePayment(body?.payment_type ?? DEFAULT_PAYMENT) === 'COD' && !(Number(body?.amount) > 0)) errs.amount ??= 'Enter COD amount';
  if (res.success && res.data.mobile2 && res.data.mobile2 === res.data.mobile1) errs.mobile2 ??= 'Same as Mobile 1 – leave empty or enter another number';
  if (Object.keys(errs).length || !res.success) {
    throw new HttpError(400, 'VALIDATION', 'Please check the highlighted fields', { fields: errs });
  }
  return res.data;
}

const ORDER_COLS = `o.id, o.ship_name, o.address, o.landmark, o.district, o.state, o.pincode, o.mobile1, o.mobile2,
  o.product_name, o.size, o.note, o.payment_type, o.amount, o.is_printed, o.printed_at, o.dup_override,
  o.created_by, cu.name AS created_by_name, o.created_at, o.updated_at, o.deleted_at`;

/** Remove amounts for users without ORDER_VIEW_AMOUNT. */
export function shape<T extends Record<string, any>>(u: AuthUser, row: T): T {
  if (can(u, 'ORDER_VIEW_AMOUNT')) return row;
  const { amount: _a, ...rest } = row;
  return rest as T;
}

export const msgHash = (raw: string) => createHash('sha256').update(normaliseForHash(raw)).digest('hex');

async function getOrder(id: number, withRaw = false) {
  const { rows } = await q(
    `SELECT ${ORDER_COLS}${withRaw ? ', o.raw_message' : ''} FROM orders o JOIN users cu ON cu.id = o.created_by WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** One combined list: every logged-in user sees every order (deleted ones: owner only). */
function canView(u: AuthUser, o: { deleted_at: unknown }) {
  return !o.deleted_at || u.role === 'ADMIN';
}

function canEdit(u: AuthUser, o: { created_by: number }) {
  return can(u, 'ORDER_EDIT_ALL') || (can(u, 'ORDER_EDIT_OWN') && o.created_by === u.id);
}

// ------------------------------------------------------------------ POST /api/orders
r.post(
  '/',
  requirePermission('ORDER_CREATE'),
  h(async (req, res) => {
    const o = parseCreate(req.body);
    const u = req.user;
    if (o.force && !can(u, 'DUPLICATE_OVERRIDE')) throw forbidden('Only the owner can save a duplicate. Ask the owner.');
    const hash = msgHash(o.raw_message || `${o.ship_name}|${o.mobile1}|${o.pincode}|${o.address}`);
    const amount = o.amount ?? null; // blank stays blank

    const result = await tx(async (c) => {
      // Same customer / same message saved by two people at the same moment: the second waits here.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`m:${o.mobile1}`]);
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`h:${hash}`]);

      // A retry of the same Save tap (network hiccup / double tap) returns the first save.
      const again = await c.query(`SELECT id FROM orders WHERE client_request_id = $1`, [o.client_request_id]);
      if (again.rowCount) return { id: again.rows[0].id as number, created: false };

      const dup = await c.query(
        `SELECT o.id, o.ship_name, o.address, o.pincode, o.mobile1, o.payment_type, o.amount,
                u.name AS saved_by, o.created_at, (o.msg_hash = $2) AS same_message
           FROM orders o JOIN users u ON u.id = o.created_by
          WHERE o.deleted_at IS NULL
            AND ((o.msg_hash = $2 AND o.created_at > now() - interval '30 days')
              OR (o.mobile1 = $1 AND o.pincode = $3 AND o.created_at > now() - interval '3 days'))
          ORDER BY same_message DESC, o.created_at DESC
          LIMIT 5`,
        [o.mobile1, hash, o.pincode],
      );
      if (dup.rowCount && !o.force) {
        const first = dup.rows[0];
        const time = new Date(first.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        throw new HttpError(
          409,
          'DUPLICATE',
          first.same_message ? `Already saved by ${first.saved_by} at ${time}` : `Same mobile and pincode saved by ${first.saved_by} at ${time}`,
          { matches: dup.rows.map((m) => shape(u, m)), canOverride: can(u, 'DUPLICATE_OVERRIDE') },
        );
      }

      const ins = await c.query(
        `INSERT INTO orders (ship_name, address, landmark, district, state, pincode, mobile1, mobile2, product_name, size, note,
                             payment_type, amount, raw_message, msg_hash, client_request_id, dup_override, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (client_request_id) DO NOTHING
         RETURNING id`,
        [o.ship_name, o.address, o.landmark, o.district, o.state, o.pincode, o.mobile1, o.mobile2, o.product_name, o.size, o.note,
          o.payment_type, amount, o.raw_message, hash, o.client_request_id, Boolean(o.force && dup.rowCount), u.id],
      );
      if (!ins.rowCount) {
        const ex = await c.query(`SELECT id FROM orders WHERE client_request_id = $1`, [o.client_request_id]);
        return { id: ex.rows[0].id as number, created: false };
      }
      const id = ins.rows[0].id as number;
      await audit(c, u.id, 'ORDER_CREATE', 'orders', id, null, { dup_override: Boolean(o.force && dup.rowCount) });
      return { id, created: true };
    });

    const order = await getOrder(result.id);
    res.status(result.created ? 201 : 200).json(shape(u, order));
  }),
);

// ------------------------------------------------------------------ GET /api/orders
const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  printed: z.enum(['yes', 'no', 'all']).default('all'),
  createdBy: z.coerce.number().int().optional(),
  q: z.string().trim().max(100).optional(),
  deleted: z.enum(['0', '1']).default('0'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

/** WHERE clause for the order list filters (also used by "Select all" -> /orders/ids). */
function listWhere(f: z.infer<typeof listQuery>, u: AuthUser) {
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    p.push(v);
    where.push(sql.replace('?', `$${p.length}`));
  };
  if (f.deleted === '1') {
    if (u.role !== 'ADMIN') throw forbidden('Only the owner can see deleted orders');
    where.push('o.deleted_at IS NOT NULL');
  } else where.push('o.deleted_at IS NULL');
  if (f.from) add(`o.created_at >= ?::date`, f.from);
  if (f.to) add(`o.created_at < (?::date + 1)`, f.to);
  if (f.printed === 'yes') where.push('o.is_printed');
  if (f.printed === 'no') where.push('NOT o.is_printed');
  if (f.createdBy) add('o.created_by = ?', f.createdBy); // optional, not used by the app
  if (f.q) {
    const digits = f.q.replace(/\D/g, '');
    if (digits.length >= 4) add(`(o.mobile1 LIKE ? OR o.mobile2 LIKE $${p.length + 1} OR o.pincode LIKE $${p.length + 1})`, `%${digits.slice(-10)}%`);
    else add(`(o.ship_name ILIKE ? OR o.address ILIKE $${p.length + 1})`, `%${f.q.replace(/[%_]/g, '')}%`);
  }
  return { w: where.join(' AND '), p };
}

// GET /api/orders/ids?<same filters> -> ids of every matching order that can be printed (for "Select all").
r.get(
  '/ids',
  h(async (req, res) => {
    const f = listQuery.parse(req.query);
    const { w, p } = listWhere({ ...f, deleted: '0' }, req.user);
    const extra = can(req.user, 'LABEL_REPRINT') ? '' : ' AND NOT o.is_printed'; // only the owner prints again
    const { rows } = await q(`SELECT o.id FROM orders o WHERE ${w}${extra} ORDER BY o.created_at DESC, o.id DESC LIMIT 5000`, p);
    res.json({ ids: rows.map((x) => x.id) });
  }),
);

// GET /api/orders/export?<same filters> -> CSV (opens in Excel) of every matching order. Owner only.
const csv = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
r.get(
  '/export',
  requireAdmin,
  h(async (req, res) => {
    const f = listQuery.parse(req.query);
    const { w, p } = listWhere(f, req.user);
    const { rows } = await q(
      `SELECT to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'DD-Mon-YYYY HH12:MI am') AS date, o.ship_name, o.address, o.landmark,
              o.district, o.state, o.pincode, o.mobile1, o.mobile2, cu.name AS added_by, o.is_printed
         FROM orders o JOIN users cu ON cu.id = o.created_by WHERE ${w}
        ORDER BY o.created_at DESC, o.id DESC LIMIT 50000`,
      p,
    );
    const head = ['Date', 'Customer', 'Address', 'Landmark', 'District', 'State', 'Pincode', 'Mobile 1', 'Mobile 2', 'Added by', 'Printed'];
    const lines = rows.map((r) =>
      [r.date, r.ship_name, r.address, r.landmark, r.district, r.state, r.pincode, r.mobile1, r.mobile2, r.added_by, r.is_printed ? 'Yes' : 'No']
        .map(csv)
        .join(','),
    );
    const name = `orders-${f.from ?? 'start'}-to-${f.to ?? 'today'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('X-File-Name', name);
    res.setHeader('Access-Control-Expose-Headers', 'X-File-Name, Content-Disposition');
    res.send('\ufeff' + [head.join(','), ...lines].join('\r\n')); // BOM: Excel shows Marathi / Hindi correctly
  }),
);

r.get(
  '/',
  h(async (req, res) => {
    const f = listQuery.parse(req.query);
    const u = req.user;
    const { w, p } = listWhere(f, u);
    const total = await q(`SELECT count(*)::int AS n FROM orders o WHERE ${w}`, p);
    p.push(f.limit, (f.page - 1) * f.limit);
    const { rows } = await q(
      `SELECT ${ORDER_COLS} FROM orders o JOIN users cu ON cu.id = o.created_by WHERE ${w}
        ORDER BY o.created_at DESC, o.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`,
      p,
    );
    res.json({ orders: rows.map((o) => shape(u, o)), total: total.rows[0].n, page: f.page });
  }),
);

// ------------------------------------------------------------------ GET /api/orders/:id
r.get(
  '/:id(\\d+)',
  h(async (req, res) => {
    const o = await getOrder(Number(req.params.id), true);
    if (!o || !canView(req.user, o)) throw notFound('Order not found');
    res.json(shape(req.user, o));
  }),
);

// ------------------------------------------------------------------ PUT /api/orders/:id
const editBody = z.object(fields).partial();

r.put(
  '/:id(\\d+)',
  requirePermission('ORDER_EDIT_OWN', 'ORDER_EDIT_ALL'),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const u = req.user;
    const before = await getOrder(id);
    if (!before || before.deleted_at || !canView(u, before)) throw notFound('Order not found');
    if (!canEdit(u, before)) throw forbidden('You can edit only the orders you saved');

    const patch = editBody.parse(req.body);
    // Users who cannot see amounts cannot change them either.
    if (!can(u, 'ORDER_VIEW_AMOUNT')) delete patch.amount;
    const next = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && k in (req.body ?? {}))) };
    next.payment_type = effectivePayment(next.payment_type);
    if (next.payment_type === 'COD' && !(Number(next.amount) > 0)) {
      throw new HttpError(400, 'VALIDATION', 'Enter COD amount', { fields: { amount: 'Enter COD amount' } });
    }
    if (next.mobile2 && next.mobile2 === next.mobile1) {
      const msg = 'Same as Mobile 1 – leave empty or enter another number';
      throw new HttpError(400, 'VALIDATION', msg, { fields: { mobile2: msg } });
    }
    await tx(async (c) => {
      await c.query(
        `UPDATE orders SET ship_name=$2, address=$3, landmark=$4, district=$5, state=$6, pincode=$7, mobile1=$8, mobile2=$9,
                product_name=$10, size=$11, note=$12, payment_type=$13, amount=$14, updated_by=$15, updated_at=now()
          WHERE id = $1`,
        [id, next.ship_name, next.address, next.landmark, next.district, next.state, next.pincode, next.mobile1, next.mobile2,
          next.product_name, next.size, next.note, next.payment_type, next.amount ?? null, u.id],
      );
      await audit(c, u.id, 'ORDER_EDIT', 'orders', id, before, next);
    });
    res.json(shape(u, await getOrder(id)));
  }),
);

// ------------------------------------------------------------------ DELETE /api/orders/:id (soft)
r.delete(
  '/:id(\\d+)',
  requirePermission('ORDER_DELETE'),
  h(async (req, res) => {
    const id = Number(req.params.id);
    const o = await getOrder(id);
    if (!o || o.deleted_at || !canView(req.user, o)) throw notFound('Order not found');
    await tx(async (c) => {
      await c.query(`UPDATE orders SET deleted_at = now(), deleted_by = $2 WHERE id = $1`, [id, req.user.id]);
      await audit(c, req.user.id, 'ORDER_DELETE', 'orders', id);
    });
    res.status(204).end();
  }),
);

// ------------------------------------------------------------------ POST /api/orders/:id/restore (owner)
r.post(
  '/:id(\\d+)/restore',
  requireAdmin,
  h(async (req, res) => {
    const id = Number(req.params.id);
    const o = await getOrder(id);
    if (!o) throw notFound('Order not found');
    await tx(async (c) => {
      await c.query(`UPDATE orders SET deleted_at = NULL, deleted_by = NULL WHERE id = $1`, [id]);
      await audit(c, req.user.id, 'ORDER_RESTORE', 'orders', id);
    });
    res.json(await getOrder(id));
  }),
);

export default r;
