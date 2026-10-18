# Prasad Shoes – Order & Label App

Staff paste a customer's WhatsApp address message → the app fills the order → Save.
The owner ticks orders → downloads **one editable Word file, 2 parcel labels per A4 page** (same layout as the shop's "Post Office COD" file).

Built from **BRD v1.0** (12 screens, 9 staff permissions, duplicate protection) in the **Clean Blue** UI template.

**→ Setup in simple steps: [docs/GUIDE.md](docs/GUIDE.md)**

## Folders

```
prasad-shoes/
  shared/          parser.ts (WhatsApp text → fields), label.ts (label text), permissions.ts, types.ts
    __tests__/     parser tests with real messages – add new ones here
  server/          Node.js + Express + PostgreSQL API
    migrations/    001_init.sql (8 tables from the BRD)
    src/routes/    auth, orders (duplicate check), labels (Word file), users (staff + permissions), shop, stats
    src/services/  docx.ts (Word file), audit.ts
    test/          end-to-end API test (BRD 10.3 checklist)
  app/             Expo (React Native) → Android APK + website, same code
    src/app/       the 12 screens (Expo Router)
  deploy/          setup-server.sh, release.sh, upload.ps1, nginx.conf, backup.sh, useful-queries.sql
  docs/GUIDE.md    step-by-step guide
```

## Stack

| Layer | Choice |
|---|---|
| App + website | Expo SDK 58 (React Native 0.88), Expo Router, TanStack Query |
| API | Node.js 24 LTS, Express 4, zod, pg (plain SQL), bcrypt, JWT (7 days) |
| Word labels | `docx` package, Nirmala UI 14 pt (prints Marathi / Hindi) |
| Database | PostgreSQL 16 on the same server, localhost only |
| Server | AWS Lightsail Ubuntu 24.04, Nginx + Let's Encrypt, PM2 |

Node 24 instead of the BRD's Node 20, because Node 20 reached end-of-life in April 2026.

## Checked before hand-over

- Parser: 12 tests pass, including both real samples (Sudharshan, Devidas Shinde in Marathi), Hindi labels, no-label messages, WhatsApp Web copies.
- API: 13 end-to-end tests pass against real PostgreSQL – login lock, first-login password change, permissions applied without re-login, staff sees only own orders / no amounts, double-tap Save = 1 order, two staff saving the same message at once = 1 order + "Already saved by…", Save anyway only with permission, deactivated staff logged out, 300 orders → one 150-page Word file.
- Word file: 40 orders = 20 pages, 3 orders = 2 pages (bottom half empty), 500 orders built in under 1 second.
- Website: every screen clicked through in a browser (phone and desktop sizes), Word file downloaded.
- Android bundle compiles. The APK itself is built with EAS (needs your Expo login – see the guide).
- Server release rehearsed: `release.sh` installs, migrates with the owner DB user, and runs the API with the limited app user.
