# Prasad Shoes – notes for Claude

Order + parcel-label app for Prasad Shoes (Pune). Staff paste a customer's WhatsApp address → fields fill →
Save → owner downloads one Word file with **2 labels per A4 page**. Full human guide: `docs/GUIDE.md`.
Owner (Varad) wants things explained in simple language, and the plan explained **before** making changes.

## Layout
- `shared/` – used by app and server: `parser.ts` (WhatsApp text → fields, `findUnused`), `label.ts` (label text),
  `features.ts` (`cod: false`), `permissions.ts`, `types.ts`. Tests in `shared/__tests__/`.
- `server/` – Node 24 + Express + PostgreSQL 16 (plain SQL, `pg`). Routes in `src/routes/`, Word file in
  `src/services/docx.ts`, India Post pincode check in `src/services/pincode.ts` + `data/pincodes.json`.
  Database changes = new numbered file in `server/migrations/` (never edit an old one).
- `app/` – Expo SDK 58 (Expo Router, TanStack Query): Android APK + website from the same code.
  Home = paste screen; Orders = List (print) / Table (owner, Excel CSV export).
- `deploy/` – AWS Lightsail scripts: `setup-server.sh` (one time), `release.sh` (every upload), `upload.ps1` (run on Windows).

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

## Deploy to AWS (docs/GUIDE.md Steps 1–5)
1. Lightsail Ubuntu 24.04 (Mumbai), static IP, firewall 22/80/443 only (never 5432). Key at `$HOME\.ssh\prasad-lightsail.pem`.
2. One time: `powershell -ExecutionPolicy Bypass -File deploy\upload.ps1 -Server ubuntu@<IP> -Setup` (add `-Domain x.in` if any).
3. Every update: `powershell -ExecutionPolicy Bypass -File deploy\upload.ps1 -Server ubuntu@<IP>`
   (builds website, uploads server + website, runs migrations, restarts PM2).
4. Owner login on the server: `cd /opt/prasad-shoes/server && npm run seed -- --name Owner --mobile <mobile> --password "<strong>"`.
5. pgAdmin: SSH tunnel (host = IP, user ubuntu, the .pem) → localhost:5432, db `prasad_shoes`, user `ps_owner`
   (password in `~/prasad-shoes-db-credentials.txt` on the server).

## APK (docs/GUIDE.md Step 6)
Set `EXPO_PUBLIC_API_URL` in `app/eas.json` to the **https** server address, commit, then in `app`:
`npx eas-cli@latest login` → `npx eas-cli@latest build --platform android --profile apk`.
A new APK is needed only when screens change; server changes reach the APK by themselves.

## Rules – don't break these
- Never commit `.env`, `*.pem`, keystores. Secrets live only in `server/.env` and on the server.
- Label "TO" order: name, address, landmark, district, state, mobile, pincode, then COD/PREPAID line;
  nothing printed twice (`shared/label.ts`). Word file: 2 labels per A4 page, must stay 2 per page in **WPS Office**
  (no table cell margins – WPS adds them to row heights).
- Mobile: any 10 digits. District / State: filled from the pincode when empty; when they don't match the
  pincode the app **asks** (Use pincode's / Keep as written) – never changes them silently.
- COD is off (`shared/features.ts`): every order is PREPAID, amount optional.
- Orders list: From–To dates, Not printed / Printed (tap again = both), 50 per page; "Select all" uses `/api/orders/ids`.
