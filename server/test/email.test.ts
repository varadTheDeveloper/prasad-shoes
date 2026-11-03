// "Send to Owner" end-to-end, against a running API and a FAKE mail server started by this test.
// Nothing is really emailed. Run (the API must use the fake mail server):
//   SMTP_HOST=127.0.0.1 SMTP_PORT=2525 OWNER_EMAIL=owner@test.local EMAIL_FROM=shop@test.local  (in the API's .env)
//   API_URL=http://localhost:3000 OWNER_MOBILE=... OWNER_PASSWORD=... SMTP_TEST_PORT=2525 TEST_OWNER_EMAIL=owner@test.local npm test
// Skipped automatically when API_URL or SMTP_TEST_PORT is not set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { inflateRawSync } from 'node:zlib';

const API = process.env.API_URL;
const SMTP_PORT = Number(process.env.SMTP_TEST_PORT || 0);
const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL ?? 'owner@test.local';
const skip = !API || !SMTP_PORT;

// ------------------------------------------------------------------ fake mail server
interface Mail {
  from: string;
  to: string[];
  data: string;
}
const inbox: Mail[] = [];
let mode: 'ok' | 'fail' = 'ok';
let delayMs = 0;
let smtp: Server;

function startSmtp(port: number) {
  return new Promise<void>((resolve) => {
    smtp = createServer((sock: Socket) => {
      let buf = '';
      let inData = false;
      let cur: Mail = { from: '', to: [], data: '' };
      const say = (l: string) => sock.write(l + '\r\n');
      say('220 fake ESMTP');
      sock.on('data', async (chunk) => {
        buf += chunk.toString('latin1');
        while (true) {
          if (inData) {
            const end = buf.indexOf('\r\n.\r\n');
            if (end < 0) return;
            cur.data = buf.slice(0, end);
            buf = buf.slice(end + 5);
            inData = false;
            if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
            if (mode === 'fail') say('554 5.0.0 Rejected for test');
            else {
              inbox.push(cur);
              say('250 2.0.0 queued');
            }
            cur = { from: '', to: [], data: '' };
            continue;
          }
          const nl = buf.indexOf('\r\n');
          if (nl < 0) return;
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === 'EHLO' || cmd === 'HELO') say('250 fake');
          else if (cmd === 'MAIL') {
            cur.from = line;
            say('250 ok');
          } else if (cmd === 'RCPT') {
            cur.to.push(line.match(/<([^>]+)>/)?.[1] ?? '');
            say('250 ok');
          } else if (cmd === 'DATA') {
            inData = true;
            say('354 go');
          } else if (cmd === 'QUIT') {
            say('221 bye');
            sock.end();
          } else if (cmd === 'RSET' || cmd === 'NOOP') say('250 ok');
          else say('250 ok');
        }
      });
      sock.on('error', () => {});
    }).listen(port, '127.0.0.1', () => resolve());
  });
}

// ------------------------------------------------------------------ helpers
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data: data as any };
}

/** The attachment of a received mail (base64 MIME part) as bytes, plus its file name. */
function attachment(m: Mail): { name: string; bytes: Buffer } {
  const part = m.data.split(/\r\n--/).find((p) => /Content-Disposition:\s*attachment/i.test(p));
  assert.ok(part, 'mail has an attachment');
  const name = part!.match(/filename="?([^";\r\n]+)"?/i)?.[1] ?? '';
  const body = part!.split(/\r\n\r\n/).slice(1).join('').replace(/\s+/g, '');
  return { name, bytes: Buffer.from(body, 'base64') };
}

/** One file from a .docx (zip), e.g. 'word/document.xml'. */
function unzip(zip: Buffer, name: string): string {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nlen = zip.readUInt16LE(p + 28);
    const xlen = zip.readUInt16LE(p + 30);
    const clen = zip.readUInt16LE(p + 32);
    const off = zip.readUInt32LE(p + 42);
    const fname = zip.subarray(p + 46, p + 46 + nlen).toString();
    if (fname === name) {
      const lnlen = zip.readUInt16LE(off + 26);
      const lxlen = zip.readUInt16LE(off + 28);
      const data = zip.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error(`${name} not in the file`);
}

const rnd = () => String(6 + Math.floor(Math.random() * 4)) + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const pin = () => String(400000 + Math.floor(Math.random() * 99999));

let owner = '';
let staff = '';
const ids: number[] = [];

async function newOrder(name: string, extra: Record<string, unknown> = {}) {
  const m = rnd();
  const r = await call(
    'POST',
    '/orders',
    {
      ship_name: name,
      address: 'Kothrud, Pune',
      pincode: pin(),
      mobile1: m,
      raw_message: `${name} ${randomUUID()}`,
      client_request_id: randomUUID(),
      ...extra,
    },
    owner,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id as number;
}

before(async () => {
  if (skip) return;
  await startSmtp(SMTP_PORT);
  const r = await call('POST', '/auth/login', { mobile: process.env.OWNER_MOBILE, password: process.env.OWNER_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  owner = r.data.token;
  // a staff member (with Download Word permission)
  const mobile = rnd();
  const add = await call('POST', '/users', { name: 'Mail Test Staff', mobile, tempPassword: 'temp123' }, owner);
  assert.equal(add.status, 201, JSON.stringify(add.data));
  const t = await call('POST', '/auth/login', { mobile, password: 'temp123' });
  await call('POST', '/auth/change-password', { oldPassword: 'temp123', newPassword: 'staff123' }, t.data.token);
  staff = (await call('POST', '/auth/login', { mobile, password: 'staff123' })).data.token;
  ids.push(await newOrder('Mail One'), await newOrder('Mail Two', { payment_type: 'COD', amount: 1999, size: '8', note: 'pona sanke awaj' }), await newOrder('Mail Three'));
});
after(() => smtp?.close());

const send = (orderIds: number[], token = owner, extra: Record<string, unknown> = {}) =>
  call('POST', '/labels/email', { orderIds, client_request_id: randomUUID(), ...extra }, token);

test('staff cannot send (403), even calling the API directly; not logged in = 401', { skip }, async () => {
  const before = inbox.length;
  const s = await send([ids[0]], staff);
  assert.equal(s.status, 403);
  assert.equal(s.data.error.code, 'FORBIDDEN');
  const anon = await send([ids[0]], '');
  assert.equal(anon.status, 401);
  assert.equal(inbox.length, before, 'nothing was emailed');
  // staff can still download Word
  const dl = await call('POST', '/labels', { orderIds: [ids[0]], markPrinted: false }, staff);
  assert.equal(dl.status, 200);
});

test('no orders selected / unknown orders are refused', { skip }, async () => {
  const none = await send([]);
  assert.equal(none.status, 400);
  const bad = await send([ids[0], 999_999_999]);
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.data.error.missingIds, [999_999_999]);
});

test('one order: one email to OWNER_EMAIL with the same Word file as Download Word', { skip }, async () => {
  const before = inbox.length;
  const r = await send([ids[0]], owner, { to: 'someone-else@example.com', recipient: 'x@example.com' }); // a sent address is ignored
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.to, OWNER_EMAIL);
  assert.equal(inbox.length, before + 1);
  const m = inbox.at(-1)!;
  assert.deepEqual(m.to, [OWNER_EMAIL]);
  assert.match(m.data, /Subject: Customer Orders - \d{2}-\d{2}-\d{4}/);
  assert.match(m.data, /Total Orders: 1/);
  const a = attachment(m);
  assert.match(a.name, /^Prasad-Shoes-Orders-\d{4}-\d{2}-\d{2}\.docx$/);
  assert.equal(a.bytes.subarray(0, 2).toString(), 'PK', 'a real .docx (zip) file');
  const dl = await call('POST', '/labels', { orderIds: [ids[0]], markPrinted: false }, owner);
  assert.equal(unzip(a.bytes, 'word/document.xml'), unzip(dl.data, 'word/document.xml'), 'same content and layout as Download Word');
});

test('several orders (Prepaid + COD): ONE email, ONE file with all of them', { skip }, async () => {
  const before = inbox.length;
  const r = await send(ids);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.orders, 3);
  assert.equal(r.data.pages, 2);
  assert.equal(inbox.length, before + 1);
  const xml = unzip(attachment(inbox.at(-1)!).bytes, 'word/document.xml');
  for (const n of ['Mail One', 'Mail Two', 'Mail Three', 'COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY', 'COD 1999 (Size 8 pona sanke awaj)']) {
    assert.ok(xml.includes(n), `${n} is in the file`);
  }
  assert.match(inbox.at(-1)!.data, /Total Orders: 3/);
  const dl = await call('POST', '/labels', { orderIds: ids, markPrinted: false }, owner);
  assert.equal(xml, unzip(dl.data, 'word/document.xml'));
});

test('the same request again (double tap / retry) does not email twice', { skip }, async () => {
  const id = randomUUID();
  const before = inbox.length;
  const a = await call('POST', '/labels/email', { orderIds: [ids[1]], client_request_id: id }, owner);
  const b = await call('POST', '/labels/email', { orderIds: [ids[1]], client_request_id: id }, owner);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(b.data.repeated, true);
  assert.equal(inbox.length, before + 1);
});

test('two sends at the same moment: the second is refused while the first is sending', { skip }, async () => {
  delayMs = 1500;
  const before = inbox.length;
  const [a, b] = await Promise.all([send([ids[0]]), new Promise((r) => setTimeout(r, 300)).then(() => send([ids[2]]))]);
  delayMs = 0;
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409)!.data.error.code, 'BUSY');
  assert.equal(inbox.length, before + 1);
});

test('mail provider failure: clear error, nothing reported as sent', { skip }, async () => {
  mode = 'fail';
  const r = await send([ids[0]]);
  mode = 'ok';
  assert.equal(r.status, 502);
  assert.equal(r.data.error.code, 'EMAIL_FAILED');
  assert.equal(r.data.error.message, 'Unable to send email. Please try again.');
  // a retry works
  const again = await send([ids[0]]);
  assert.equal(again.status, 200);
});

test('Send to Owner does not mark orders printed (Download Word still does)', { skip }, async () => {
  const id = await newOrder('Mail Four');
  assert.equal((await send([id])).status, 200);
  assert.equal((await call('GET', `/orders/${id}`, undefined, owner)).data.is_printed, false);
});

test('at most 10 emails per hour per owner', { skip }, async () => {
  let last = 200;
  for (let i = 0; i < 12 && last === 200; i++) last = (await send([ids[0]])).status;
  assert.equal(last, 429);
});
