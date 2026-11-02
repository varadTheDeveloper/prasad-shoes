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
  Home = paste screen; Orders = List (print) / Table (owner, Excel CSV export).
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
cd server; npm test                                   # parser, label, pincode tests
# full API tests: start the API, then
$env:API_URL="http://localhost:3000"; $env:OWNER_MOBILE="7020861805"; $env:OWNER_PASSWORD="owner123"; npm test
cd app; npx tsc --noEmit
```

## Live setup (as of 2 Nov 2026)
- Server: **AWS EC2**, Mumbai (ap-south-1), Ubuntu 24.04, 20 GB disk, Elastic IP **65.2.112.70** (new on 2 Nov 2026 – the old 13.203.156.41 was released; old APKs point to it and stop working).
  Security group: 22, 80, 443 only (PostgreSQL 5432 stays closed). Login user `ubuntu`, key `prasad-key` (.pem, not in Git).
- Website + API: **https://65-2-112-70.sslip.io** (free sslip.io name + Let's Encrypt, renews itself).
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
(Alternative from Windows: `deploy\upload.ps1 -Server ubuntu@65.2.112.70`, see docs/GUIDE.md.)
Owner login (re)set: `cd /opt/prasad-shoes/server && npm run seed -- --name Owner --mobile 7020861805 --password "<strong>"`.

## New APK (only when screens change)
On the PC: commit + push, then in `app`: `npx eas-cli@latest build --platform android --profile apk`.
`app/eas.json` already points the APK to `https://65-2-112-70.sslip.io` (must be https).
Server-only changes do not need a new APK.

## Rules – don't break these
- Never commit `.env`, `*.pem`, keystores. Secrets live only in `server/.env` and on the server.
- Label "TO" order: name, address, landmark, district, state, mobile, pincode, then COD/PREPAID line;
  nothing printed twice (`shared/label.ts`). Word file: 2 labels per A4 page, must stay 2 per page in **WPS Office**
  (no table cell margins – WPS adds them to row heights).
- Mobile: any 10 digits. District / State: filled from the pincode when empty; when they don't match the
  pincode the app **asks** (Use pincode's / Keep as written) – never changes them silently.
- Prepaid / COD picked before pasting (`orders.payment_type`, default PREPAID). **Never change the Prepaid label.**
  COD: amount required; booking date + weight in their own columns (migration 005), cleared when an order is Prepaid.
  Booking Under / Customer ID 1634841966 / Contract ID 41282773 / BNPL HUB Pune 411001 are constants in `shared/cod.ts` –
  never stored, never parsed, always printed. COD label = the shop's printed COD label: 4 centred header lines
  ("Booking Under …", bold "Customer ID : …, Contract ID – …", "BNPL HUB Pune 411001, Weight : …    Date : DD/MM/YYYY",
  bold "COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY") → TO block right (as Prepaid) →
  bold "COD 1999 (Size 8 pona sanke awaj)" (size + note; COD reader splits "Size 8 pona sanke awaj") → From = shop, left.
  No barcode (the post office sticks it on). COD font shrinks (14→9 pt, `codSize` in docx.ts) to fit the half page.
- Orders list: From–To dates, Not printed / Printed (tap again = both), 50 per page; "Select all" uses `/api/orders/ids`.
