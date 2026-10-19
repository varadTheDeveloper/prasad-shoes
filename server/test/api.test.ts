// End-to-end API test against a running server (BRD 10.3 acceptance checklist).
// Run: API_URL=http://localhost:3000 OWNER_MOBILE=7020861805 OWNER_PASSWORD=... npm test
// Skipped automatically when API_URL is not set.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL;
const skip = !API;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data: data as any, headers: res.headers };
}

const rnd = () => String(6 + Math.floor(Math.random() * 4)) + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const pin = () => String(400000 + Math.floor(Math.random() * 99999));

let owner = '';
let staff = '';
let staffId = 0;
const staffMobile = rnd();

function order(extra: Record<string, unknown> = {}) {
  const m = rnd();
  return {
    ship_name: 'Test Customer',
    address: 'Vill Tekumatla, Jaipur mandal',
    pincode: pin(),
    mobile1: m,
    payment_type: 'COD',
    amount: 1299,
    size: '10',
    note: 'RED KURUNDWAD',
    raw_message: `Naam - Test\nMobile ${m}\n${randomUUID()}`,
    client_request_id: randomUUID(),
    ...extra,
  };
}

before(async () => {
  if (skip) return;
  const r = await call('POST', '/auth/login', { mobile: process.env.OWNER_MOBILE, password: process.env.OWNER_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  owner = r.data.token;
});

test('owner adds staff; staff must change temp password first', { skip }, async () => {
  const add = await call('POST', '/users', { name: 'Rahul', mobile: staffMobile, tempPassword: 'temp123' }, owner);
  assert.equal(add.status, 201, JSON.stringify(add.data));
  staffId = add.data.id;
  assert.ok(add.data.permissions.includes('ORDER_CREATE'));
  assert.ok(!add.data.permissions.includes('ORDER_DELETE'));

  const login = await call('POST', '/auth/login', { mobile: staffMobile, password: 'temp123' });
  assert.equal(login.data.mustChangePassword, true);
  const blocked = await call('GET', '/orders', undefined, login.data.token);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, 'PASSWORD_CHANGE_REQUIRED');
  const ch = await call('POST', '/auth/change-password', { oldPassword: 'temp123', newPassword: 'rahul123' }, login.data.token);
  assert.equal(ch.status, 204);
  const again = await call('POST', '/auth/login', { mobile: staffMobile, password: 'rahul123' });
  staff = again.data.token;
  assert.equal(again.data.mustChangePassword, false);
});

test('validation: missing pincode / bad mobile', { skip }, async () => {
  const r = await call('POST', '/orders', order({ pincode: '01234', mobile1: '12345' }), staff);
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.pincode);
  assert.ok(r.data.error.fields.mobile1);
  assert.ok(!r.data.error.fields.amount, 'amount is optional');
});

test('amount is optional: blank, null or missing all save, and stay blank', { skip }, async () => {
  for (const amount of ['', null, undefined]) {
    const o: any = order({ amount });
    if (amount === undefined) delete o.amount;
    delete o.payment_type;
    const r = await call('POST', '/orders', o, staff);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.amount, null);
  }
  const withAmt = await call('POST', '/orders', order({ amount: 1599 }), staff);
  assert.equal(withAmt.data.amount, 1599);
  // Editing an order and clearing its amount keeps working
  const ed = await call('PUT', `/orders/${withAmt.data.id}`, { amount: null }, staff);
  assert.equal(ed.status, 200);
  assert.equal(ed.data.amount, null);
});

test('COD is switched off: every new order is saved as PREPAID', { skip }, async () => {
  const r = await call('POST', '/orders', order({ payment_type: 'COD', amount: null }), staff);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.payment_type, 'PREPAID');
  const d = await call('POST', '/orders', order({ payment_type: undefined }), staff);
  assert.equal(d.data.payment_type, 'PREPAID');
});

test('product name empty or filled both save', { skip }, async () => {
  assert.equal((await call('POST', '/orders', order(), staff)).status, 201);
  assert.equal((await call('POST', '/orders', order({ product_name: 'Kolhapuri Kurundwad' }), staff)).status, 201);
});

test('double tap Save (same client_request_id) creates one order', { skip }, async () => {
  const o = order();
  const [a, b] = await Promise.all([call('POST', '/orders', o, staff), call('POST', '/orders', o, staff)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.data.id, b.data.id);
});

test('two staff paste the same message at once: one saved, other told "Already saved by"', { skip }, async () => {
  const base = order();
  const a = { ...base, client_request_id: randomUUID() };
  const b = { ...base, client_request_id: randomUUID() };
  const [r1, r2] = await Promise.all([call('POST', '/orders', a, staff), call('POST', '/orders', b, owner)]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const dup = r1.status === 409 ? r1 : r2;
  assert.equal(dup.data.error.code, 'DUPLICATE');
  assert.match(dup.data.error.message, /Already saved by/);
});

test('same mobile + pincode in 3 days warns; Save anyway needs DUPLICATE_OVERRIDE', { skip }, async () => {
  const first = order();
  assert.equal((await call('POST', '/orders', first, staff)).status, 201);
  const second = { ...first, raw_message: 'different text ' + randomUUID(), client_request_id: randomUUID() };
  const w = await call('POST', '/orders', second, staff);
  assert.equal(w.status, 409);
  assert.equal(w.data.error.canOverride, false);
  const forced = await call('POST', '/orders', { ...second, force: true }, staff);
  assert.equal(forced.status, 403);
  const ownerForced = await call('POST', '/orders', { ...second, force: true }, owner);
  assert.equal(ownerForced.status, 201);
  assert.equal(ownerForced.data.dup_override, true);
});

test('one combined list: staff and owner see everyone\'s orders; no ORDER_VIEW_AMOUNT = no amounts; applies without re-login', { skip }, async () => {
  const ownersOrder = (await call('POST', '/orders', order(), owner)).data;
  const staffsOrder = (await call('POST', '/orders', order(), staff)).data;
  for (const tok of [staff, owner]) {
    const ids = (await call('GET', '/orders?limit=1000', undefined, tok)).data.orders.map((o: any) => o.id);
    assert.ok(ids.includes(ownersOrder.id) && ids.includes(staffsOrder.id), 'both orders in one list');
  }
  await call('PUT', `/users/${staffId}/permissions`, { codes: ['ORDER_CREATE', 'ORDER_EDIT_OWN', 'LABEL_PRINT'] }, owner);
  const list = await call('GET', '/orders', undefined, staff);
  assert.equal(list.status, 200);
  assert.ok(list.data.orders.some((o: any) => o.created_by !== staffId), 'still sees the owner\'s orders');
  assert.ok(list.data.orders.every((o: any) => !('amount' in o)));
  // Turn ORDER_CREATE off -> 403 on next action
  await call('PUT', `/users/${staffId}/permissions`, { codes: ['LABEL_PRINT'] }, owner);
  assert.equal((await call('POST', '/orders', order(), staff)).status, 403);
  // Back to defaults
  await call('PUT', `/users/${staffId}/permissions`, { codes: ['ORDER_CREATE', 'ORDER_VIEW_AMOUNT', 'ORDER_EDIT_OWN', 'LABEL_PRINT'] }, owner);
});

test('staff prints owner + staff orders together in one Word file, 2 per page', { skip }, async () => {
  const a = (await call('POST', '/orders', order(), owner)).data;
  const b = (await call('POST', '/orders', order(), staff)).data;
  const c = (await call('POST', '/orders', order({ amount: null }), owner)).data;
  const r = await call('POST', '/labels', { orderIds: [a.id, b.id, c.id] }, staff);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.headers.get('x-page-count'), '2');
  assert.match(r.headers.get('content-disposition') ?? '', /-3-orders\.docx/);
});

test('staff edits own order, cannot delete; owner deletes and restores', { skip }, async () => {
  const mine = (await call('POST', '/orders', order(), staff)).data;
  const ed = await call('PUT', `/orders/${mine.id}`, { note: 'BLACK' }, staff);
  assert.equal(ed.status, 200);
  assert.equal(ed.data.note, 'BLACK');
  assert.equal(ed.data.size, '10'); // untouched fields stay
  const ownersOrder = (await call('POST', '/orders', order(), owner)).data;
  assert.equal((await call('PUT', `/orders/${ownersOrder.id}`, { note: 'X' }, staff)).status, 403);
  assert.equal((await call('DELETE', `/orders/${mine.id}`, undefined, staff)).status, 403);
  assert.equal((await call('DELETE', `/orders/${mine.id}`, undefined, owner)).status, 204);
  assert.equal((await call('GET', `/orders/${mine.id}`, undefined, staff)).status, 404);
  assert.equal((await call('POST', `/orders/${mine.id}/restore`, undefined, owner)).status, 200);
});

test('300 orders -> one Word file with 150 pages (2 per page); reprint needs LABEL_REPRINT', { skip }, async () => {
  const ids: number[] = [];
  for (let i = 0; i < 300; i += 25) {
    const batch = await Promise.all(Array.from({ length: 25 }, () => call('POST', '/orders', order(), owner)));
    ids.push(...batch.map((b) => b.data.id));
  }
  const t = Date.now();
  const r = await call('POST', '/labels', { orderIds: ids, markPrinted: true }, staff);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-page-count'), '150');
  assert.match(r.headers.get('content-disposition') ?? '', /labels-\d{4}-\d{2}-\d{2}-300-orders\.docx/);
  assert.ok((r.data as Buffer).subarray(0, 2).toString() === 'PK', 'docx is a zip');
  assert.ok(Date.now() - t < 10_000, 'under 10 seconds');
  if (process.env.SAVE_DOCX) (await import('node:fs')).writeFileSync(process.env.SAVE_DOCX, r.data);
  const again = await call('POST', '/labels', { orderIds: ids.slice(0, 2) }, staff);
  assert.equal(again.status, 403);
  const ownerAgain = await call('POST', '/labels', { orderIds: ids.slice(0, 2) }, owner);
  assert.equal(ownerAgain.status, 200);
  const printed = await call('GET', `/orders/${ids[0]}`, undefined, owner);
  assert.equal(printed.data.is_printed, true);
});

test('stats for home screens', { skip }, async () => {
  const s = await call('GET', '/stats', undefined, owner);
  assert.equal(s.status, 200);
  assert.ok(s.data.ordersToday > 0);
  assert.ok(s.data.staffToday.length > 0);
});

test('deactivated staff: next call 401, cannot log in', { skip }, async () => {
  await call('PATCH', `/users/${staffId}`, { isActive: false }, owner);
  assert.equal((await call('GET', '/orders', undefined, staff)).status, 401);
  assert.equal((await call('POST', '/auth/login', { mobile: staffMobile, password: 'rahul123' })).status, 401);
  await call('PATCH', `/users/${staffId}`, { isActive: true }, owner);
});

test('5 wrong passwords lock the mobile for 15 minutes', { skip }, async () => {
  const m = rnd();
  await call('POST', '/users', { name: 'Lock Test', mobile: m, tempPassword: 'temp123' }, owner);
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/auth/login', { mobile: m, password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { mobile: m, password: 'wrong' })).status, 423);
  assert.equal((await call('POST', '/auth/login', { mobile: m, password: 'temp123' })).status, 423);
});

test('shop details: staff cannot edit', { skip }, async () => {
  const shop = (await call('GET', '/shop', undefined, staff)).data;
  assert.equal(shop.shop_name, 'PRASAD SHOES');
  assert.equal((await call('PUT', '/shop', shop, staff)).status, 403);
  assert.equal((await call('PUT', '/shop', shop, owner)).status, 200);
});
