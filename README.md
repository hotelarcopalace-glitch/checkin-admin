# Checkin Admin — checkin.co.in

Admin panel for checkin.co.in: password-protected sign-in, dashboard, and an SMS list
page with search, status/date filters, pagination and CSV export.

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS v4 and Postgres.

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run db:setup -- --seed   # creates the sms_messages table + demo rows
npm run dev                  # http://localhost:3000
```

## 2. Environment variables

| Variable | What it is |
| --- | --- |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD_HASH` | scrypt hash of the admin password (never store the plain password) |
| `SESSION_SECRET` | 64-char random hex — signs the session cookie |
| `DATABASE_URL` | Postgres connection string (Neon / Vercel Postgres / Supabase) |
| `DB_POOL_MAX` | optional, default `3` — max pooled DB connections |

Generate a fresh admin username/password/secret at any time:

```bash
npm run gen:admin -- myusername
```

It prints the plain password once (save it) plus the env values to paste into Vercel.

## 3. Database

Any Postgres works. Easiest: **Vercel → Storage → Create Database → Neon**, or a free
database at [neon.tech](https://neon.tech). Copy the connection string into `DATABASE_URL`,
then:

```bash
npm run db:setup -- --seed
```

`--seed` inserts 12 demo messages, drop it if you only want the empty table.
Schema lives in [`db/schema.sql`](db/schema.sql).

To feed the list with real traffic, insert a row whenever your app sends an SMS:

```sql
INSERT INTO sms_messages (recipient, guest_name, message, status, provider, template, segments, cost, sent_at)
VALUES ($1, $2, $3, 'sent', 'msg91', 'checkin_otp', 1, 0.18, NOW());
```

## 4. Deploy to Vercel

1. Push this repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → Import the repo → framework auto-detects Next.js.
3. Before the first deploy, add the four environment variables above under
   **Settings → Environment Variables** (Production + Preview).
4. Deploy.

## 5. Point checkin.co.in at Vercel (GoDaddy)

In Vercel: **Project → Settings → Domains → Add** `checkin.co.in` and `www.checkin.co.in`.
Vercel then shows the exact DNS records. In GoDaddy (**My Products → Domain → DNS →
Manage Zones**) set:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `64.29.17.1` | 600 |
| CNAME | `www` | `8e06b7d491dac3d9.vercel-dns-017.com` | 600 |

(Values confirmed with `vercel domains verify checkin.co.in` on 22 Aug 2026.)

Delete any existing A/CNAME record on `@` or `www` first (GoDaddy parking records).
DNS usually propagates in 10–60 minutes; Vercel issues the SSL certificate automatically.

> Always use the values Vercel shows in its Domains tab — they occasionally change.

## 6. Security notes

- The password is stored only as a scrypt hash; the session is a signed JWT in an
  httpOnly cookie that expires after 12 hours.
- Login is rate limited to 10 attempts per IP per 5 minutes.
- `/admin/*` is protected in `middleware.ts` and re-checked server-side in the admin layout.
- Change the admin password by re-running `npm run gen:admin` and updating the Vercel env vars.

## Project structure

```
app/
  login/page.tsx          sign-in screen
  admin/page.tsx          dashboard
  admin/sms/page.tsx      SMS list (filters, pagination, export)
  api/auth/login          credential check + session cookie
  api/auth/logout         clears the session
  api/sms/export          CSV download of the current filter
lib/
  auth.ts                 JWT session sign/verify
  password.ts             scrypt hash + timing-safe verify
  db.ts                   pooled Postgres client
  sms.ts                  queries, filters, stats
db/schema.sql             table + indexes
scripts/gen-admin.mjs     credential generator
scripts/db-setup.mjs      applies schema (+ optional seed)
```
