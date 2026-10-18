import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db';
import { h } from '../errors';
import { can, requireAdmin } from '../middleware/auth';
import { audit } from '../services/audit';

const r = Router();
const COLS = 'shop_name, address1, address2, city_pin, phones';

// GET /api/shop – any logged-in user (used for label preview)
r.get(
  '/',
  h(async (_req, res) => {
    const { rows } = await q(`SELECT ${COLS}, updated_at FROM shop_settings WHERE id = 1`);
    res.json(rows[0]);
  }),
);

const body = z.object({
  shop_name: z.string().trim().min(1, 'Enter shop name').max(100),
  address1: z.string().trim().min(1, 'Enter address').max(200),
  address2: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  city_pin: z.string().trim().min(1, 'Enter city and pincode').max(100),
  phones: z.string().trim().min(1, 'Enter phone numbers').max(100),
});

// PUT /api/shop – owner only. Applies to the next downloaded Word file.
r.put(
  '/',
  requireAdmin,
  h(async (req, res) => {
    const b = body.parse(req.body);
    const before = (await q(`SELECT ${COLS} FROM shop_settings WHERE id = 1`)).rows[0];
    await tx(async (c) => {
      await c.query(
        `UPDATE shop_settings SET shop_name=$1, address1=$2, address2=$3, city_pin=$4, phones=$5, updated_by=$6, updated_at=now() WHERE id = 1`,
        [b.shop_name, b.address1, b.address2, b.city_pin, b.phones, req.user.id],
      );
      await audit(c, req.user.id, 'SHOP_EDIT', 'shop_settings', 1, before, b);
    });
    res.json((await q(`SELECT ${COLS}, updated_at FROM shop_settings WHERE id = 1`)).rows[0]);
  }),
);

export const statsRouter = Router();

// GET /api/stats – numbers for the Home screen (staff) and Dashboard (owner)
statsRouter.get(
  '/',
  h(async (req, res) => {
    const u = req.user;
    const viewAll = can(u, 'ORDER_VIEW_ALL');
    const scope = viewAll ? '' : 'AND o.created_by = $1';
    const p = viewAll ? [] : [u.id];
    const today = `o.deleted_at IS NULL AND o.created_at >= current_date`;

    const [mine, notPrinted, todayAll, staff, recent] = await Promise.all([
      q(`SELECT count(*)::int AS n FROM orders o WHERE ${today} AND o.created_by = $1`, [u.id]),
      q(`SELECT count(*)::int AS n FROM orders o WHERE o.deleted_at IS NULL AND NOT o.is_printed ${scope}`, p),
      q(
        `SELECT count(*)::int AS n, COALESCE(sum(o.amount) FILTER (WHERE o.payment_type = 'COD'), 0)::float AS cod
           FROM orders o WHERE ${today} ${scope}`,
        p,
      ),
      viewAll
        ? q(
            `SELECT u.id, u.name, count(o.id)::int AS orders, max(o.created_at) AS last_order
               FROM orders o JOIN users u ON u.id = o.created_by
              WHERE ${today} GROUP BY u.id ORDER BY orders DESC`,
          )
        : Promise.resolve({ rows: [] as any[] }),
      q(
        `SELECT o.id, o.ship_name, o.pincode, o.payment_type, o.amount, o.is_printed, o.created_at
           FROM orders o WHERE o.deleted_at IS NULL AND o.created_by = $1 ORDER BY o.created_at DESC LIMIT 5`,
        [u.id],
      ),
    ]);
    const showAmount = can(u, 'ORDER_VIEW_AMOUNT');
    res.json({
      savedByMeToday: mine.rows[0].n,
      notPrinted: notPrinted.rows[0].n,
      ordersToday: todayAll.rows[0].n,
      codToday: showAmount ? todayAll.rows[0].cod : null,
      staffToday: staff.rows,
      myRecent: recent.rows.map((o) => (showAmount ? o : { ...o, amount: undefined })),
    });
  }),
);

export default r;
