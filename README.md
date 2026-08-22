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
| `SMS_API_KEY` | secret for the `POST /api/sms/log` endpoint |

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

## 4. Logging SMS from your check-in software

`POST /api/sms/log` inserts messages that then appear on the SMS List page.
Authenticate with the `SMS_API_KEY` environment variable — send it as
`Authorization: Bearer <key>` or `X-API-Key: <key>`.

```bash
curl -X POST https://checkin.co.in/api/sms/log \
  -H "Authorization: Bearer $SMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "recipient":  "+919812345601",
        "guest_name": "Rohit Sharma",
        "message":    "Your check-in OTP is 482913.",
        "status":     "delivered",
        "provider":   "msg91",
        "template":   "checkin_otp",
        "cost":       0.18
      }'
```

Response: `201 {"ok":true,"inserted":1,"ids":["42"]}`

| Field | Required | Notes |
| --- | --- | --- |
| `recipient` | yes | phone number, digits with optional `+` |
| `message` | yes | up to 2000 characters |
| `guest_name` | no | shown under the number in the list |
| `status` | no | `queued` / `sent` / `delivered` / `failed` — defaults to `sent` |
| `provider` | no | e.g. `msg91`, `textlocal` |
| `template` | no | e.g. `checkin_otp` |
| `segments` | no | auto-calculated from message length if omitted |
| `cost` | no | defaults to `0` |
| `error` | no | failure reason, shown in red on the list |
| `sent_at` | no | ISO timestamp; set to now for `sent`/`delivered` |

**Bulk:** send `{"messages": [ … ]}` or a bare array, up to 100 per request.

Errors: `401` bad key, `400` validation failure (the message names the field and
index), `503` database not ready.

Generate a new key any time with:

```bash
node -e 'console.log("cks_" + require("crypto").randomBytes(24).toString("base64url"))'
```

Then update `SMS_API_KEY` locally and in Vercel, and redeploy.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → Import the repo → framework auto-detects Next.js.
3. Before the first deploy, add the four environment variables above under
   **Settings → Environment Variables** (Production + Preview).
4. Deploy.

## 6. Point checkin.co.in at Vercel (GoDaddy)

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

## 7. Security notes

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
  api/sms/log             API-key protected insert endpoint
  api/admin/db-setup      admin-only schema setup
lib/
  auth.ts                 JWT session sign/verify
  password.ts             scrypt hash + timing-safe verify
  db.ts                   pooled Postgres client
  sms.ts                  queries, filters, stats
db/schema.sql             table + indexes
scripts/gen-admin.mjs     credential generator
scripts/db-setup.mjs      applies schema (+ optional seed)
```
