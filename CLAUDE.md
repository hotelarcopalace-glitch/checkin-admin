# Checkin Admin — project context

Admin panel for **checkin.co.in** (Hotel Arco Palace check-in software).
Live, in production. This file is the handover: read it before changing anything.

## What it is

Next.js 15 (App Router) + TypeScript + Tailwind v4 + Postgres. A password-protected
admin area with a dashboard and an SMS list, plus two APIs that let the hotel's
check-in software and its SMS gateway push messages in.

## Live URLs

| What | Where |
| --- | --- |
| Site | https://checkin.co.in — admin at `/admin` |
| Fallback | https://checkin-admin-ten.vercel.app |
| Repo | https://github.com/hotelarcopalace-glitch/checkin-admin (private) |
| Vercel project | `checkin-admin` in scope `hotelarcopalace-glitchs-projects` |

Admin username is `admin`. The password is only in `.env.local` (never committed) and
in the Vercel env vars as a scrypt hash. Lost it? Run `npm run gen:admin` and update
`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` in Vercel, then redeploy.

## Infrastructure

- **Hosting:** Vercel, auto-deploys on every push to `main`. The Vercel CLI is logged in
  on the owner's Mac, so `vercel env`, `vercel redeploy`, `vercel domains` all work.
- **Database:** Neon Postgres, resource `neon-citrine-tree`, free plan, Singapore region,
  provisioned through the Vercel marketplace. It injects `DATABASE_URL` automatically —
  **never set that variable by hand.**
- **Domain:** checkin.co.in is registered at **GoDaddy** (nameservers `domaincontrol.com`).
  There is no GoDaddy API access here; DNS edits are manual, done by the owner.
  Current records: `A @ → 64.29.17.1`, `CNAME www → 8e06b7d491dac3d9.vercel-dns-017.com`.
  SSL is Let's Encrypt, issued and renewed by Vercel.
- The owner also has a **Hostinger** account (arcoautozone.in/.com, carspareparts.co.in,
  and a KVM 2 VPS running WordPress). Unrelated to this project — do not touch it.

## Environment variables

`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SMS_API_KEY`,
`DATABASE_URL` (from Neon), optional `DB_POOL_MAX`.

## Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | — | admin login, sets a 12h signed JWT cookie |
| `POST /api/auth/logout` | — | clears the cookie |
| `GET /api/sms/export` | admin session | CSV of the current filter |
| `POST /api/admin/db-setup` | admin session | applies `db/schema.sql`, `?seed=1` adds demo rows. Idempotent. |
| `POST /api/sms/log` | `SMS_API_KEY` | structured insert, 1–100 messages, full validation |
| `GET\|POST /api/sms/SMSInsert` | **none — open** | vendor endpoint: `mobileNo` + `smsText`, returns `{code:0}` / `{code:1}` |

`SMSInsert` is also served at `/api/sms/insert` and `/newadmin/api/sms/SMSInsert`;
all three share `lib/sms-insert.ts`. It mirrors the contract of the owner's existing
hotelarcopalace.com API so the SMS vendor needs no changes. It is deliberately
unauthenticated at the owner's request — only a 60/minute per-IP limit guards it.

## Gotchas learned the hard way

- **Vercel env vars added through the dashboard came back empty at runtime.** Names showed
  in `vercel env ls` but `process.env` was blank. Re-adding them with `vercel env add`
  fixed it. Always verify at runtime, not just in the listing.
- **Sensitive env vars cannot be read back** — `vercel env pull` returns `[SENSITIVE]`.
  That is why `/api/admin/db-setup` exists: it runs the schema from inside the deployment
  where `DATABASE_URL` is available.
- **Marketplace integrations need the owner to accept vendor terms in a browser.**
  `vercel integration add` fails until they do.
- **Env var changes need a redeploy** (`vercel redeploy <url>`) to take effect.
- After a DNS change, browsers cache the old IP and certificate for a while — verify with
  `curl --resolve` before assuming something is broken.

## Working style that fits this project

- There is no local Postgres. To test database code, install `@electric-sql/pglite` and
  `@electric-sql/pglite-socket` with `--no-save`, serve on a port, and point
  `DATABASE_URL` at it with `DB_POOL_MAX=1` (the socket server takes one connection).
  Clean the packages up afterwards.
- Verify against the live site with `curl` before telling the owner it works.
- The owner writes in Hinglish and prefers that back. They want the work done for them,
  not instructions — do every step you can and only hand over what genuinely needs their
  account access.

## State as of 22 Aug 2026

Everything above is live and tested: login, dashboard, SMS list with search/status/date
filters, pagination, CSV export, both insert APIs, custom domain with SSL.

The database holds ~31 demo and test rows. **Clearing them is the next task** — the owner
wants a clean table before real traffic, and asked for an admin-only "clear data" action.

Possible follow-ups they raised: pulling logs directly from the SMS provider
(MSG91/Textlocal/Fast2SMS/Twilio — not chosen yet), serving the same API on
hotelarcopalace.com, and more admin pages (bookings, guests, reports).
