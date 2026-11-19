# Prasad Shoes – notes for Claude

Order + parcel-label app for Prasad Shoes (Pune). Staff paste a customer's WhatsApp address → fields fill →
Save → owner downloads one Word file with **2 labels per A4 page**. Full human guide: `docs/GUIDE.md`.
Owner (Varad) wants things explained in simple language, and the plan explained **before** making changes.

## Layout
- `shared/` – used by app and server: `parser.ts` (WhatsApp text → fields, `findUnused`; COD: `parseCodMessage`, `codRemainder`, `splitSize`),
  `label.ts` (label text; COD: `codHeadLines`, `codAmountLine`, `codOrderLine`), `cod.ts` (fixed COD details, amount in words),
  `features.ts` (`cod: true`), `permissions.ts`, `types.ts`. Tests in `shared/__tests__/`.
- `server/` – Node 24 + Express + PostgreSQL 16 (plain SQL, `pg`). Routes in `src/routes/`, Word file in
  `src/services/docx.ts`, India Post pincode check in `src/services/pincode.ts` + `data/pincodes.json`.
  Database changes = new numbered file in `server/migrations/` (never edit an old one).
- `app/` – Expo SDK 58 (Expo Router, TanStack Query): Android APK + website from the same code.
  Home = first only two big buttons PREPAID / COD (stacked, colours `TYPE_COLOR` in theme.ts, `components/TypeChooser.tsx`), then the paste screen for that type
  ("‹ Back" in the header → the two buttons, also Android back / browser ←, "Discard this order?" if unsaved; counts and "Print today's labels" for that type, `/api/stats?type=`); Orders = the two PREPAID / COD buttons first, then that list (separate lists,
  `type=` on `/api/orders`, `/orders/ids`, export; list returns `counts`), List (print) / Table (owner, Excel .xlsx export: `services/xlsx.ts`, all details, mobiles as text; the Excel box has a tick "Also send to email" → `POST /api/orders/export/email`, same safety as Send to Owner, audit `EXCEL_EMAIL`).
- `deploy/` – AWS server scripts (written for Lightsail, used on EC2): `setup-server.sh` (one time), `release.sh` (every upload), `upload.ps1` (run on Windows).

## Run on the PC (Windows)
```powershell
cd server; npm run migrate:dev; npm run dev          # API on http://127.0.0.1:3000 (needs server\.env)
cd app;    npx expo start -c                          # w = website (localhost:8081), a = Android emulator
```
- `app\.env.development` has `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` (emulator). The website swaps it to localhost.
- Owner login for testing: `npm run seed:dev -- --name Owner --mobile 7020861805 --password owner123` (in `server`).

## Tests (run before every change is called done)
```powershell
cd server; npm test                                   # parser, label, pincode tests (API needs PUBLIC_URL set for the reset test)
# full API tests: start the API, then
$env:API_URL="http://localhost:3000"; $env:OWNER_MOBILE="7020861805"; $env:OWNER_PASSWORD="owner123"; npm test
cd app; npx tsc --noEmit
```

## Live setup (as of 4 Nov 2026)
- Server: **Oracle Cloud free-server-2** (Always Free VM.Standard.E2.1.Micro: 1 GB RAM + 2 GB swap), Hyderabad (ap-hyderabad-1),
  Ubuntu 24.04, 47 GB disk, **reserved** public IP **144.24.139.223** (fixed). Moved from AWS EC2 on 4 Nov 2026.
  Oracle security list: 22, 80, 443 only; Ubuntu's own iptables also opens 80/443 (no ufw on Oracle). Login user `ubuntu`, SSH key not in Git.
  Free tier: Oracle may *stop* (not delete) the server after 7 idle days – just Start it again in the console (IP stays, it is reserved).
- Website + API: **https://144-24-139-223.sslip.io** (free sslip.io name + Let's Encrypt, renews itself).
- Old AWS EC2 (Elastic IP 65.2.112.70): API stopped; its nginx only forwards `/api` to Oracle so old APKs keep working.
  Kept about one week as a fallback (nginx backup `~/nginx-before-oracle.bak`), then shut down + Elastic IP released.
  Health check: `/api/health`. API runs under PM2 as `prasad-api`; code in `/opt/prasad-shoes`, website in `/var/www/prasad-shoes`.
- Database: PostgreSQL 16 on the same server, db `prasad_shoes`, users `ps_owner` (migrations) / `ps_app` (API).
  Passwords only in `~/prasad-shoes-db-credentials.txt` and `/opt/prasad-shoes/server/.env` on the server – never print or commit them.
- Nightly backup at 1 am (14 days kept). pgAdmin: SSH tunnel to the server, then localhost:5432.
- APK: built with **EAS** (Expo account `varad0108`, project `prasad-shoes`, profile `apk`). The signing key is stored by Expo –
  always build with the same account, or phones can't update the app.

## Updating the live server
Done **on the server** (a Claude session runs there), from GitHub `main`:
```bash
cd ~/prasad-shoes && git pull
cd app && npm ci && npx expo export --platform web            # website -> app/dist
rm -rf /tmp/ps-release && mkdir -p /tmp/ps-release && cp -r ../server ../shared ../deploy /tmp/ps-release/ && cp -r dist /tmp/ps-release/web
rm -rf /tmp/ps-release/server/node_modules /tmp/ps-release/server/.env
bash ~/prasad-shoes/deploy/release.sh /tmp/ps-release          # build API, run migrations, restart PM2, publish website
```
(Alternative from Windows: `deploy\upload.ps1 -Server ubuntu@144.24.139.223`, see docs/GUIDE.md.)
Owner login (re)set: `cd /opt/prasad-shoes/server && npm run seed -- --name Owner --mobile 7020861805 --password "<strong>"`.

## New APK (only when screens change)
On the PC: commit + push, then in `app`: `npx eas-cli@latest build --platform android --profile apk`.
`app/eas.json` already points the APK to `https://144-24-139-223.sslip.io` (must be https).
Server-only changes do not need a new APK.

## Rules – don't break these
- Never commit `.env`, `*.pem`, keystores. Secrets live only in `server/.env` and on the server.
- Label "TO" order: name, address, landmark, district, state, mobile, pincode, then COD/PREPAID line;
  nothing printed twice (`shared/label.ts`). Word file: 2 labels per A4 page, must stay 2 per page in **WPS Office**
  (no table cell margins – WPS adds them to row heights).
- Paste reader (17 Nov 2026): no labels + first line clearly an address (number / road, city, nagar, nambar… / state / >5 words)
  + a later line clearly a name (2–4 letter-only words) → that line is the name (both marked to check; `looksLikeAddress/Name`).
  `saysCod` = "COD 2250" in the message: on the PREPAID screen a red box above Save asks "is this a COD order?"
  (Switch to COD = same message read as COD / Keep PREPAID); Save waits for the answer, never switches by itself.
  COD reader: a size written before "COD" ("Size 7 COD 2250") is part of the note → "COD 2250 (Size 7)".
  Several pairs (client, 17 Nov 2026): 2 or 10 pairs to one address = ONE order, ONE box, ONE label. COD amount in the
  message = total for all pairs; no COD = prepaid. Size box = every size in order ("7, 11"), Note = every size line as
  written joined with ", " (COD amount kept out: "COD 2798 (Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar)").
  `ParseResult.pairs` → "2 pairs · one box, one label" tag; Excel "Pairs" column (`pairCount(size)`); prices on every
  pair line add up to Amount (prepaid). Migration 007: size VARCHAR(100), note VARCHAR(500).
  Pair lines keep the message's order. Client, 18 Nov 2026: NEVER lose a product line, and fill the Size box ONLY when the
  size is clearly marked ("Size 11", "11 no", "11 number"). A line "1–13 + words" without that ("11 3 tail Sankeshwar",
  "9 kapsi maharaja naal") goes to Note as written with Size empty (staff type it) when it comes after the pincode / mobile
  (no address word) or next to another pair line (or just before a last COD line with product words); before the
  contact and alone it stays address ("12 Shivaji Nagar"). Words before the COD amount ("11 3 tail Sankeshwar COD. 2798")
  are note too, except label words (Total, Amount…). A size typed by hand never prints twice: a pasted note prints alone,
  and `noteSaysSize` also accepts a note line that starts with that size ("11 3 tail…"). A note made of several pasted lines
  joined with ", " (other words like "COD 1799" sat between them) still counts as pasted (`noteIsPasted` checks each
  piece); sizes typed as "8 9" / "8/9" / "8, 9" are each checked (18 Nov 2026).
  A line with NO number among the pair lines ("kapsi maharaja naal" between "Size 8 …" and "Size 11 …") goes to Note too,
  in order, never the address – when it comes after the pincode / mobile next to a pair line, or sits between two pair
  lines; not counted in "N pairs" (it may describe the pair above).
  A full stop after the size counts ("Size : 7. Awaj…" → 7; "7.5" is still a half size). An amount line that also names the
  pair ("COD 2249/- (Size : 7. Awaj Shahu Kolhapuri)") goes to Note as written on PREPAID too – never dropped.
  Client, 18 Nov 2026: the note always comes at the END – every unlabelled line after the LAST mobile / pincode line goes
  to Note as written, never the address (Size only when marked). "COD" right after a comma (",COD 1799") is found, and
  every "8 no" inside the COD note fills Size.
  Pincode (18 Nov 2026): any 6 digits (not starting with 0) are the pincode even without the word "pincode" – inside the
  address line, own line, "pune-411061", "pune411061", "411 061", Marathi digits, or on the mobile line ("Mob 83… 411061").
  A "DIST RAICHUR KARNATAKA 584170" / "State … 411061" line: pincode and a state name at its end go to their own boxes.
  "(400099)" in the address leaves no empty "( )"; "State := maharashtra ( Mumbai )" → State Maharashtra, "Mumbai" added
  to the end of the address (unless already there).
  The mark after a label can be any mix of : ; - = . _ > ("Pincode;= 400099", "Name :-", "State =>", ":_") – tested.
  Client, 19 Nov 2026 (again): NEVER drop a word of a product line – a "Size …" line goes to Note WHOLE, always (extra
  spaces, "Size - medium" too). Permanent test: 15 kinds of product lines × 1 or 2 pairs × PREPAID / COD, every word printed.
  Several sizes of one product on one line (client, 19 Nov 2026): "Size 7&6 no rec kurundwad" → Size "7, 6", 2 pairs;
  "Size 6,7&8 …" → 3; also "6 and 7", "7&6 no …" (`sizeList`). Needs & / "and" – "Size 6,7" (comma only) is NOT split.
  Note stays the line as written.
  No 6 digits at all = Pincode left empty (required, staff type it).
- Paste screen on a phone (client, 18 Nov 2026): while the Message box is being edited it grows to ~45–60% of the screen
  (font 17), the big paste button steps aside and a "Done ✓" button shrinks it back (also on blur). Website (wide) unchanged.
- More mobiles (client, 18 Nov 2026): a 3rd, 4th… number in the message goes to "More mobiles" (`orders.mobile_more`,
  migration 008, "9272741689, 9876543210", any 10 digits each, comma-separated) and ALL numbers print on the label in the
  order given: "Mob. 8378830571, 9881270271, 9272741689" (`toLines`). Searchable; Excel column "More mobiles".
- Mobile: any 10 digits. District / State: filled from the pincode when empty; when they don't match the
  pincode the app **asks** (Use pincode's / Keep as written) – never changes them silently.
- Prepaid / COD picked before pasting (`orders.payment_type`, default PREPAID). **Never change the Prepaid label** except on the client's request
  (changes so far: 5 Nov 2026 – the Prepaid amount prints last when filled, `PREPAID (red capsi, 9 no, 1299)`, not twice when the Note already has that price;
  16 Nov 2026 – Prepaid also starts with the first 3 COD header lines (Booking Under / Customer ID + Contract ID / BNPL HUB, Weight, Date), never the
  "COD FOR RUPEES" line – `headLines`, `labelOrderLine` in label.ts).
  COD: amount required. Booking date + weight in their own columns (migration 005), kept for BOTH types (printed on both labels);
  label date = booking date, else the day the order was saved (`created_date`, IST), else today (preview).
  Booking Under / Customer ID 1634841966 / Contract ID 41282773 / BNPL HUB Pune 411001 are constants in `shared/cod.ts` –
  never stored, never parsed, always printed. COD label = the shop's printed COD label: 4 centred header lines
  ("Booking Under …", bold "Customer ID : …, Contract ID – …", "BNPL HUB Pune 411001, Weight : …    Date : DD/MM/YYYY",
  bold "COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY") → TO block right (as Prepaid) →
  bold "COD 1999 (Size 8 pona sanke awaj)" – the words after the COD amount are the Note, printed exactly as written (client, 5 Nov 2026: "COD 1299 Size-7 no sanke" → "COD 1299 (Size-7 no sanke)"); Size box = the number only. Prepaid the same: the size line ("(SIZE- 9 CUTKAAN KaPSHI 1799)", "Size 9 4veni 999+sol") is the Note as written and prints as it is, without "9 no" again (`noteSaysSize`). Rule (5 Nov 2026): a Note that came from the pasted message prints ALONE – nothing added from Product / Size / Amount (`noteIsPasted`); only when the Note was not pasted do the typed fields print → From = shop, left.
  No barcode (the post office sticks it on). Font shrinks (14→9 pt, `labelSize` in docx.ts) to fit the half page.
- Print layout (docx.ts + printHtml.ts, identical): each label sits in the MIDDLE of its half of the paper (top label row 8 mm → centred at 74.25 mm,
  blank row to the cut line; blank row under the cut line, bottom label centred at 222.75 mm); one font size per label (`labelSize`, 14→9 pt).
- Orders tab (client, 17 Nov 2026): opens with ONLY the two big PREPAID / COD buttons (TypeChooser, each with "N not printed" from
  `/api/stats?type=`); a bottom-bar tap always starts there. The chosen list (never mixed): header "‹ Back" + coloured "PREPAID orders" /
  "COD orders" (List / Table on the right); Back, Android back and browser ← return to the buttons, asking "Clear the selection?" when
  orders are ticked; an order page and back keeps the list. Home "Print today's labels" opens a type's list directly (`type` param).
  Then From–To dates, Not printed / Printed (tap again = both), 50 per page; "Select all" uses `/api/orders/ids` (with `type`).
- **Send to Owner** (Orders footer, ADMIN only – button hidden for staff, `requireAdmin` on the server):
  `POST /api/labels/email {orderIds, client_request_id}` → same `buildLabelsDocx` file as Download Word, one email to
  `OWNER_EMAIL` (comma-separated list allowed; server/.env only; the app never sends a recipient) via the **Resend** HTTP API with built-in fetch, no
  package (`services/mailer.ts`; `RESEND_API_KEY`, `EMAIL_FROM` on a Resend-verified domain). Does not mark orders printed.
  One send at a time per user (advisory lock), same request id = no second email (also Resend Idempotency-Key),
  10 per hour (audit_logs `LABEL_EMAIL`). Never log customer details.
  Tests: `test/email.test.ts` with a fake Resend server (`RESEND_TEST_PORT`; API runs with `RESEND_API_URL=http://127.0.0.1:<port>`).
- **Sessions + Forgot password** (16 Nov 2026, migration 006): every token carries `users.token_version` (`tv`) and its own id (`jti`).
  Password change (answers a fresh token for this device), owner's staff reset, email reset and `npm run seed` raise token_version →
  all older logins end. `POST /api/auth/logout` ends only that device (`revoked_tokens`). Owner only: `POST /api/auth/forgot {mobile}`
  always answers the same message; for an active ADMIN it emails a one-time link `PUBLIC_URL/reset-password#key=…` (key after `#`: never sent to / logged by the server; 15 min,
  max 3 unused links per 15 min – counted and saved under a per-owner lock so quick repeated taps can't pass it; only the key's SHA-256 is stored) to `OWNER_EMAIL` via Resend. `PUBLIC_URL` comes only from
  server/.env (never from the Host header). Reset page: `app/reset-password.tsx` (works logged in or out). Staff ask the owner.
  Every owner password change (reset link or Change password) emails "the owner password was changed" to OWNER_EMAIL.
  Website security headers + CSP: `deploy/nginx-headers.conf` → /etc/nginx/snippets/prasad-shoes-headers.conf, included in the
  `location /` and `/_expo/` blocks (nginx drops server-level add_header there); `release.sh` installs/updates it, rolls back if `nginx -t` fails.
  Test files run one at a time (`--test-concurrency=1`): the reset test changes the owner password and sets it back.
