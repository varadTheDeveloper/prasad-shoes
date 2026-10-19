# Prasad Shoes app – simple setup guide

This guide explains everything in easy steps. Follow them in order.
**Commands for your Windows PC** go in **PowerShell**. **Commands for the server** go in the SSH window.

---

## What you get

| Part | What it does | Where it runs |
|---|---|---|
| **App** (`app/`) | Staff paste the WhatsApp message → fields fill by themselves → Save. Owner ticks orders → downloads one Word file, one order per A4 page. | Android phone (APK) + website |
| **Server** (`server/`) | Login, orders, duplicate check, staff permissions, makes the Word file | AWS server |
| **Database** | PostgreSQL – all orders, staff and settings | **Same** AWS server (not open to the internet) |
| **pgAdmin** | You see the tables and run SQL from your Windows PC | Your PC, connected safely through SSH |

Cost: one AWS Lightsail server, **2 GB plan = US $12 / month** (about ₹1,050). Domain name is optional.

---

## Step 1 – Create the AWS server (10 minutes, one time)

1. Open **https://lightsail.aws.amazon.com** and log in to AWS.
2. Click **Create instance**.
   - Region: **Mumbai (ap-south-1)**
   - Platform: **Linux/Unix** → Blueprint: **OS Only** → **Ubuntu 24.04 LTS**
   - Plan: **$12 / month (2 GB RAM)** (the $7 / 1 GB plan also works – the setup adds swap)
   - Name: `prasad-shoes` → **Create instance**
3. Open the instance → **Networking** tab:
   - **Create static IP** → attach it to `prasad-shoes`. Write down this IP, e.g. `13.233.10.20`.
   - **IPv4 Firewall**: keep **SSH (22)** and **HTTP (80)**, click **Add rule** → **HTTPS (443)**.
     Do **not** add 5432 – the database must stay closed.
     (Better security: edit the SSH rule → "Restrict to IP address" → your IP, and tick **Allow Lightsail browser SSH**.)
4. Download the SSH key: top right **Account** → **SSH keys** → **Download** the default key for Mumbai.
   Save it as `C:\Users\varad\.ssh\prasad-lightsail.pem`, then in PowerShell:

```powershell
icacls "$HOME\.ssh\prasad-lightsail.pem" /inheritance:r
icacls "$HOME\.ssh\prasad-lightsail.pem" /grant:r "$($env:USERNAME):(R)"
ssh -i "$HOME\.ssh\prasad-lightsail.pem" ubuntu@13.233.10.20     # type "yes" once, then "exit"
```

---

## Step 2 – Set up the server (one command, about 5 minutes)

On your PC, in the `prasad-shoes` folder:

```powershell
cd $HOME\Documents\prasad-shoes
powershell -ExecutionPolicy Bypass -File deploy\upload.ps1 -Server ubuntu@13.233.10.20 -Setup
```

This installs on the server: **Node.js 24 LTS, PostgreSQL 16, Nginx, free HTTPS certificate, PM2, nightly backup, firewall**.

- No domain? It uses a free address like **`https://13-233-10-20.sslip.io`** (works with HTTPS).
- Bought a domain (e.g. `prasadshoes.in`)? First add an **A record** pointing to the server IP, then run with `-Domain prasadshoes.in`.

At the end it prints your web address. The database passwords are saved on the server in `~/prasad-shoes-db-credentials.txt`.

---

## Step 3 – Upload the app

Once on your PC: `cd app` → `npm install` → `cd ..` (installs the app tools). Then:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\upload.ps1 -Server ubuntu@13.233.10.20
```

It builds the website, uploads server + website, updates the database tables, and restarts the API.
**Run this same command every time you change the code.**

---

## Step 4 – Create the owner login (one time)

```powershell
ssh -i "$HOME\.ssh\prasad-lightsail.pem" ubuntu@13.233.10.20
```
Then on the server:
```bash
cd /opt/prasad-shoes/server
npm run seed -- --name "Owner" --mobile 7020861805 --password "choose-a-strong-password"
```

Open your web address in Chrome and log in with that mobile and password. 🎉
Add staff from the **Staff** tab. Each staff member sets their own password at first login.

---

## Step 5 – Connect pgAdmin on Windows to the AWS database

The database port is closed to the internet. pgAdmin reaches it **through SSH** (safe and encrypted).

1. On the server, see the password: `cat ~/prasad-shoes-db-credentials.txt` → copy `OWNER_PASSWORD`.
2. In pgAdmin: right-click **Servers** → **Register** → **Server…**
   - **General** → Name: `Prasad Shoes AWS`
   - **Connection** →
     - Host name/address: `localhost`
     - Port: `5432`
     - Maintenance database: `prasad_shoes`
     - Username: `ps_owner`
     - Password: *(the OWNER_PASSWORD)* → tick Save password
   - **SSH Tunnel** →
     - Use SSH tunneling: **Yes**
     - Tunnel host: `13.233.10.20` · Tunnel port: `22`
     - Username: `ubuntu`
     - Authentication: **Identity file** → choose `C:\Users\varad\.ssh\prasad-lightsail.pem`
3. **Save**. Open `prasad_shoes` → Schemas → public → Tables.
   Ready-made queries: open `deploy\useful-queries.sql` in the Query Tool.

**DBeaver** works the same way: SSH tab (host = IP, user `ubuntu`, key = the .pem), Main tab (host `localhost`, port 5432, db `prasad_shoes`, user `ps_owner`).

> Your old Windows PostgreSQL is not touched. You can keep it for testing on your PC (see "Run on your PC" below).

---

## Step 6 – Make the Android app (APK)

1. Free Expo account: https://expo.dev/signup
2. Open `app\eas.json` and change both `https://YOUR-DOMAIN` to your real address, e.g. `https://13-233-10-20.sslip.io`.
   (It must be **https** – Android blocks plain http.)
3. In PowerShell:

```powershell
cd $HOME\Documents\prasad-shoes\app
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile apk
```
   Say **Yes** when it asks to create the project and a new Android keystore.
4. After about 15 minutes you get a download link. Send the APK on WhatsApp → open on the phone → allow "install unknown apps".

A new APK is needed only when screens change. Server changes (Step 3) reach the APK automatically.

> EAS builds from the Git repository, so keep the `prasad-shoes` folder as a Git repo (it already is) and **commit your changes before building**.

---

## Daily use (for the shop)

1. Customer fills the address template on WhatsApp.
2. Staff long-press the messages → **Copy** → in the app tap **New order** → paste (or "Paste from clipboard").
3. Check the fields (yellow = please check) → add product / note / size → **Save order**.
4. Same message pasted twice? The app shows **"Already saved by Rahul at 12:41 pm"**.
5. Evening: **Home → Print labels** → all unprinted orders are ticked → **Download Word** → print.

---

## Run on your PC (for testing changes)

You can use your Windows PostgreSQL. In pgAdmin create a database `prasad_shoes`. Then:

```powershell
cd $HOME\Documents\prasad-shoes\server
copy .env.example .env        # edit DATABASE_URL (your local postgres user/password), delete the MIGRATE_DATABASE_URL line,
                              # set JWT_SECRET to any long text and NODE_ENV=development
npm install
npm run migrate:dev
npm run seed:dev -- --name Owner --mobile 7020861805 --password owner123
npm run dev                   # API on http://localhost:3000
```
In a second PowerShell (add `CORS_ORIGINS=http://localhost:8081` to `server\.env` first):
```powershell
cd $HOME\Documents\prasad-shoes\app
copy .env.example .env.development
npm install
npm run web                   # opens the app in the browser
```
Tests: `cd server` → `npm test` (parser tests). Full API tests: start the API, then
`$env:API_URL="http://localhost:3000"; $env:OWNER_MOBILE="7020861805"; $env:OWNER_PASSWORD="owner123"; npm test`.

---

## Backups

- Every night at 1:00 am the server saves a backup in `/var/backups/prasad-shoes` (last 14 days kept).
- Also turn on **Lightsail → instance → Snapshots → Enable automatic snapshots** (small extra cost).
- Restore a backup (on the server):
  `sudo -u postgres pg_restore --clean --if-exists -d prasad_shoes /var/backups/prasad-shoes/<file>.dump`

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Website does not open | Lightsail firewall must have 80 and 443. On server: `sudo systemctl status nginx` |
| "Server not reachable" in the app | On server: `pm2 status` and `pm2 logs prasad-api --lines 50` |
| HTTPS failed during setup | Port 80 open? Domain pointing to the IP? Then run `sudo certbot --nginx -d <your address>` |
| pgAdmin cannot connect | Check the SSH key path, user `ubuntu`, and host `localhost` in the Connection tab |
| Staff forgot password | Owner → Staff → **Reset password** |
| Owner forgot password | Run the Step 4 seed command again with a new password |
| `ssh` says "UNPROTECTED PRIVATE KEY" | Run the two `icacls` lines from Step 1 |
