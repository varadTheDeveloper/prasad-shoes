import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db';
import { HttpError, forbidden, h, notFound } from '../errors';
import { can, requirePermission } from '../middleware/auth';
import { audit } from '../services/audit';
import { buildLabelsDocx } from '../services/docx';
import { pagesFor, type LabelOrder, type LabelShop } from '../../../shared/label';

const r = Router();

async function loadShop(): Promise<LabelShop> {
  const { rows } = await q(`SELECT shop_name, address1, address2, city_pin, phones FROM shop_settings WHERE id = 1`);
  return rows[0];
}

const LABEL_COLS = `id, ship_name, address, landmark, district, state, pincode, mobile1, mobile2, product_name, size, note,
  payment_type, amount, is_printed, created_by`;

function istDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // 2026-10-18
}

function sendDocx(res: any, buf: Buffer, count: number, batchId: number) {
  const name = `labels-${istDate()}-${count}-orders.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('X-File-Name', name);
  res.setHeader('X-Batch-Id', String(batchId));
  res.setHeader('X-Page-Count', String(pagesFor(count)));
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}

const body = z.object({
  orderIds: z.array(z.number().int().positive()).min(1, 'Select at least one order').max(5000),
  markPrinted: z.boolean().default(true),
});

// POST /api/labels  {orderIds:[...], markPrinted} -> .docx file
r.post(
  '/',
  requirePermission('LABEL_PRINT'),
  h(async (req, res) => {
    const { orderIds, markPrinted } = body.parse(req.body);
    const u = req.user;
    const ids = [...new Set(orderIds)];
    const { rows } = await q(`SELECT ${LABEL_COLS} FROM orders WHERE id = ANY($1::int[]) AND deleted_at IS NULL`, [ids]);
    const byId = new Map(rows.map((o) => [o.id, o]));
    // Keep the order the user selected; skip orders this user may not see.
    const orders = ids.map((id) => byId.get(id)).filter((o) => o && (can(u, 'ORDER_VIEW_ALL') || o.created_by === u.id));
    if (orders.length === 0) throw notFound('No orders to print');
    const already = orders.filter((o) => o.is_printed);
    if (already.length && !can(u, 'LABEL_REPRINT')) {
      throw new HttpError(403, 'FORBIDDEN', `${already.length} of these orders are already printed. Only the owner can reprint them.`, {
        printedIds: already.map((o) => o.id),
      });
    }

    const buf = await buildLabelsDocx(orders as LabelOrder[], await loadShop());

    const batchId = await tx(async (c) => {
      const b = await c.query(`INSERT INTO label_batches (created_by, order_count, page_count) VALUES ($1,$2,$3) RETURNING id`, [
        u.id,
        orders.length,
        pagesFor(orders.length),
      ]);
      const id = b.rows[0].id as number;
      await c.query(
        `INSERT INTO label_batch_orders (batch_id, order_id, position)
         SELECT $1, x.id, x.pos FROM unnest($2::int[]) WITH ORDINALITY AS x(id, pos)`,
        [id, orders.map((o) => o.id)],
      );
      if (markPrinted) {
        await c.query(`UPDATE orders SET is_printed = TRUE, printed_at = now(), printed_by = $2 WHERE id = ANY($1::int[])`, [
          orders.map((o) => o.id),
          u.id,
        ]);
      }
      await audit(c, u.id, 'LABEL_PRINT', 'label_batches', id, null, { orders: orders.length, markPrinted });
      return id;
    });

    sendDocx(res, buf, orders.length, batchId);
  }),
);

// GET /api/labels – recent downloads
r.get(
  '/',
  requirePermission('LABEL_PRINT'),
  h(async (req, res) => {
    const mine = can(req.user, 'ORDER_VIEW_ALL') ? '' : 'WHERE b.created_by = $1';
    const { rows } = await q(
      `SELECT b.id, b.order_count, b.page_count, b.created_at, u.name AS created_by_name
         FROM label_batches b JOIN users u ON u.id = b.created_by ${mine}
        ORDER BY b.created_at DESC LIMIT 20`,
      mine ? [req.user.id] : [],
    );
    res.json({ batches: rows });
  }),
);

// GET /api/labels/:id/docx – download an earlier file again (uses current order details)
r.get(
  '/:id(\\d+)/docx',
  requirePermission('LABEL_PRINT'),
  h(async (req, res) => {
    if (!can(req.user, 'LABEL_REPRINT')) throw forbidden('Only the owner can download an earlier file again');
    const id = Number(req.params.id);
    const { rows } = await q(
      `SELECT ${LABEL_COLS.split(',').map((c) => 'o.' + c.trim()).join(', ')}
         FROM label_batch_orders bo JOIN orders o ON o.id = bo.order_id
        WHERE bo.batch_id = $1 AND o.deleted_at IS NULL ORDER BY bo.position`,
      [id],
    );
    if (!rows.length) throw notFound('File not found');
    const buf = await buildLabelsDocx(rows as LabelOrder[], await loadShop());
    sendDocx(res, buf, rows.length, id);
  }),
);

export default r;
