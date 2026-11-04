import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, q, tx } from '../db';
import { HttpError, forbidden, h, notFound } from '../errors';
import { can, requireAdmin, requirePermission, type AuthUser } from '../middleware/auth';
import { audit } from '../services/audit';
import { buildLabelsDocx } from '../services/docx';
import { buildLabelsHtml } from '../services/printHtml';
import { mailReady, sendToOwner } from '../services/mailer';
import { pagesFor, type LabelOrder, type LabelShop } from '../../../shared/label';

const r = Router();

async function loadShop(): Promise<LabelShop> {
  const { rows } = await q(`SELECT shop_name, address1, address2, city_pin, phones FROM shop_settings WHERE id = 1`);
  return rows[0];
}

const LABEL_COLS = `id, ship_name, address, landmark, district, state, pincode, mobile1, mobile2, product_name, size, note,
  payment_type, amount, is_printed, created_by, weight`;
/** Columns for the label, with table prefix p ('o.' or ''); the booking date as 'YYYY-MM-DD' text. */
const labelCols = (p = '') =>
  `${LABEL_COLS.split(',').map((c) => p + c.trim()).join(', ')}, to_char(${p}booking_date, 'YYYY-MM-DD') AS booking_date`;

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

/** Loads the orders (in the order picked), checks reprint rights, records the batch and (optionally)
 *  marks them printed. Used by Download Word and by Print – both count as printing. */
async function printBatch(u: AuthUser, orderIds: number[], markPrinted: boolean, via: 'word' | 'print') {
  const ids = [...new Set(orderIds)];
  const { rows } = await q(`SELECT ${labelCols()} FROM orders WHERE id = ANY($1::int[]) AND deleted_at IS NULL`, [ids]);
  const byId = new Map(rows.map((o) => [o.id, o]));
  // One combined list: orders saved by the owner and by every staff member print together,
  // in the order the user selected them.
  const orders = ids.map((id) => byId.get(id)).filter(Boolean);
  if (orders.length === 0) throw notFound('No orders to print');
  const already = orders.filter((o) => o.is_printed);
  if (already.length && !can(u, 'LABEL_REPRINT')) {
    throw new HttpError(403, 'FORBIDDEN', `${already.length} of these orders are already printed. Only the owner can reprint them.`, {
      printedIds: already.map((o) => o.id),
    });
  }
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
    await audit(c, u.id, 'LABEL_PRINT', 'label_batches', id, null, { orders: orders.length, markPrinted, ...(via === 'print' ? { via } : {}) });
    return id;
  });
  return { orders: orders as LabelOrder[], batchId };
}

// POST /api/labels  {orderIds:[...], markPrinted} -> .docx file
r.post(
  '/',
  requirePermission('LABEL_PRINT'),
  h(async (req, res) => {
    const { orderIds, markPrinted } = body.parse(req.body);
    const { orders, batchId } = await printBatch(req.user, orderIds, markPrinted, 'word');
    const buf = await buildLabelsDocx(orders, await loadShop());
    sendDocx(res, buf, orders.length, batchId);
  }),
);

// ------------------------------------------------------------------ POST /api/labels/print (owner only)
// "Print": the same labels as the Word file as a print page (services/printHtml.ts). Marks the orders
// printed (like Download Word). Answers with a one-time link: the website loads it in a hidden frame and
// prints; the phone app opens it in Chrome, which shows the print window. The link works once, for
// 10 minutes, and carries no customer data – only a random key.
const PRINT_TTL = 10 * 60_000;
const printPages = new Map<string, { html: string; until: number }>();

r.post(
  '/print',
  requireAdmin,
  h(async (req, res) => {
    const { orderIds, markPrinted } = body.parse(req.body);
    const { orders } = await printBatch(req.user, orderIds, markPrinted, 'print');
    const shop = await loadShop();
    const key = randomBytes(24).toString('base64url');
    const now = Date.now();
    for (const [k, v] of printPages) if (v.until < now) printPages.delete(k);
    printPages.set(key, { html: buildLabelsHtml(orders, shop, req.body?.autoPrint === true), until: now + PRINT_TTL });
    res.json({ url: `/api/print/${key}`, orders: orders.length, pages: pagesFor(orders.length) });
  }),
);

/** GET /api/print/:key – the print page (no login: the random one-time key is the permission). */
export const printPageRouter = Router();
printPageRouter.get('/:key', (req, res) => {
  const p = printPages.get(req.params.key);
  printPages.delete(req.params.key);
  res.setHeader('Cache-Control', 'no-store');
  if (!p || p.until < Date.now()) {
    res.status(404).type('html').send('<p style="font-family:sans-serif">This print link has expired. Tap Print again in the app.</p>');
    return;
  }
  res.type('html').send(p.html);
});

// ------------------------------------------------------------------ POST /api/labels/email (owner only)
// "Send to Owner": the same Word file as Download Word, emailed to OWNER_EMAIL (server/.env).
// The app sends only order ids + a request id – never a recipient. Orders are NOT marked printed.
const emailBody = z.object({
  orderIds: z.array(z.number().int().positive()).min(1, 'Select at least one order').max(5000),
  client_request_id: z.uuid('Missing request id'),
});
const EMAILS_PER_HOUR = 10;

/** 03-11-2026 (India time). */
function istDay() {
  const [y, m, d] = istDate().split('-');
  return `${d}-${m}-${y}`;
}

r.post(
  '/email',
  requireAdmin, // the role comes from the database (requireAuth), never from the request
  h(async (req, res) => {
    const { orderIds, client_request_id } = emailBody.parse(req.body);
    const u = req.user;
    if (!mailReady()) throw new HttpError(503, 'EMAIL_NOT_SET_UP', 'Email is not set up on the server yet.');

    // One send at a time per user (a double tap waits for nothing – it is refused), on one connection
    // so the lock is released by the same session that took it.
    const c = await pool.connect();
    const lockKey = `label-email:${u.id}`;
    const locked = (await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [lockKey])).rows[0].ok as boolean;
    if (!locked) {
      c.release();
      throw new HttpError(409, 'BUSY', 'Already sending – please wait.');
    }
    try {
      // The same request again (retry after a lost answer): it was already sent, do not send twice.
      const done = await c.query(
        `SELECT new_data FROM audit_logs WHERE action = 'LABEL_EMAIL' AND user_id = $1 AND new_data->>'request_id' = $2 LIMIT 1`,
        [u.id, client_request_id],
      );
      if (done.rowCount) {
        const d = done.rows[0].new_data;
        return res.json({ sent: true, to: d.to, orders: d.orders, pages: d.pages, fileName: d.file, repeated: true });
      }
      const recent = await c.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'LABEL_EMAIL' AND user_id = $1 AND created_at > now() - interval '1 hour'`,
        [u.id],
      );
      if (recent.rows[0].n >= EMAILS_PER_HOUR) {
        throw new HttpError(429, 'RATE_LIMITED', `At most ${EMAILS_PER_HOUR} emails per hour. Please try again later.`);
      }

      // Every selected order must exist (and not be deleted).
      const ids = [...new Set(orderIds)];
      const { rows } = await c.query(`SELECT ${labelCols()} FROM orders WHERE id = ANY($1::int[]) AND deleted_at IS NULL`, [ids]);
      const byId = new Map(rows.map((o) => [o.id, o]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) {
        throw new HttpError(400, 'VALIDATION', `${missing.length} of the selected orders no longer exist. Refresh the list and try again.`, {
          missingIds: missing,
        });
      }
      const orders = ids.map((id) => byId.get(id)) as LabelOrder[];

      // Exactly the same Word file as Download Word.
      const file = await buildLabelsDocx(orders, await loadShop());
      const pages = pagesFor(orders.length);
      const day = istDay();
      const fileName = `Prasad-Shoes-Orders-${istDate()}.docx`;
      const text = [
        'Hello,',
        '',
        'Please find attached the selected customer orders in Word format.',
        '',
        'Order Summary:',
        '',
        `* Total Orders: ${orders.length}`,
        `* Generated Date: ${day}`,
        '',
        'The attached document contains customer shipping details and order information for processing and printing.',
        '',
        'Regards,',
        'Prasad Shoes',
      ].join('\n');

      let sent: { to: string };
      try {
        sent = await sendToOwner({ subject: `Customer Orders - ${day}`, text, fileName, file, idempotencyKey: client_request_id });
      } catch (e) {
        // No customer details in the log: only what went wrong with the email provider.
        const err = e as { code?: string; responseCode?: number; message?: string };
        console.error(`[label-email] Resend failed: ${err.responseCode ?? ''} ${err.code ?? ''} ${String(err.message ?? '').slice(0, 200)}`);
        throw new HttpError(502, 'EMAIL_FAILED', 'Unable to send email. Please try again.');
      }
      await audit(c, u.id, 'LABEL_EMAIL', 'orders', null, null, {
        request_id: client_request_id,
        to: sent.to,
        orders: orders.length,
        pages,
        file: fileName,
      });
      res.json({ sent: true, to: sent.to, orders: orders.length, pages, fileName });
    } finally {
      await c.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => {});
      c.release();
    }
  }),
);

// GET /api/labels – recent downloads
r.get(
  '/',
  requirePermission('LABEL_PRINT'),
  h(async (req, res) => {
    const { rows } = await q(
      `SELECT b.id, b.order_count, b.page_count, b.created_at, u.name AS created_by_name
         FROM label_batches b JOIN users u ON u.id = b.created_by
        ORDER BY b.created_at DESC LIMIT 20`,
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
      `SELECT ${labelCols('o.')}
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
