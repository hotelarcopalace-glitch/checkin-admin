# Checkin Admin — project context

Admin panel for **checkin.co.in** (Hotel Arco Palace check-in software).
Live, in production. This file is the handover: read it before changing anything.

## What it is

Next.js 15 (App Router) + TypeScript + Tailwind v4 + Postgres. A password-protected
admin area with a dashboard and an SMS list, plus two APIs that let the hotel's
check-in software and its SMS gateway push messages in.

The **public site at `/`** is the owner's original checkin.co.in marketing site, restored
from the Wayback Machine snapshot of 2 Apr 2023 (`20230402024347`). It is plain static
HTML in `public/` — `index.html` (also `index-2.html`), `aboutus.html`, `service.html`,
`contact_us.html`, `client.html`, plus `css/`, `js/`, `images/`. A rewrite in
`next.config.ts` maps `/` to `/index.html`; there is no `app/page.tsx`. Do not "modernise"
these files unasked — they are a faithful restore. Known gaps: the homepage Flash banner
(`flash/checkin banner.swf`) cannot play in any current browser, the `Check-In.msi` and
`SMSExcel2007AddInSetup.msi` download links were not restored, and `client.html` was
already a MySQL error page when the snapshot was taken.

## Live URLs

| What | Where |
| --- | --- |
| Site | https://checkin.co.in — admin at `/mng-x7k9` (`/admin` just redirects home) |
| Server | **Linode** `checkin-prod`, Mumbai 2, Ubuntu 24.04, 2 GB, IP `172.236.182.160` (moved here from Netlify on 21 Oct 2026) |
| Repo | https://github.com/checkinsoftware/checkin-admin (**private**, standalone, no longer a fork) |

Hosting moved from Vercel to Netlify on 30 Sep 2026 (the Vercel projects are gone), then from
Netlify to a Linode server on 21 Oct 2026 (Netlify credits made it too costly).
Admin username is `admin`. The password is in the gitignored `CREDENTIALS-NEW-SETUP.txt`
and on the server (`/home/deploy/checkin.env`) as a scrypt hash. Lost it? Run `npm run gen:admin`,
put the new `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` into that env file and `sudo systemctl restart checkin`.

## Infrastructure

### Server (Linode `checkin-prod`) — current production
- **Access:** `ssh -i C:\Users\Info\linode-keys\id_ed25519 deploy@172.236.182.160` (root works with the same key;
  password logins are off). Linode firewall `checkin-fw` + UFW allow only 22, 80, 443. fail2ban is on.
  Linode Backups are enabled on the account plan; the root password is only with the owner.
- **Stack:** nginx (TLS, `/etc/nginx/sites-available/checkin`) -> Next.js on 127.0.0.1:3000 run by systemd
  (`checkin.service`, user `deploy`) -> Postgres 16 on localhost (db and role `checkin`). Node 22, 2 GB swap.
  nginx overwrites `X-Forwarded-For` and `X-Nf-Client-Connection-Ip` with the real peer address; the per-IP
  rate limits and the SMSInsert source IP depend on that, so keep it.
- **Env file:** `/home/deploy/checkin.env` (mode 600, systemd `EnvironmentFile` and sourced for builds). It holds
  everything listed under "Environment variables" plus `SMS_GATEWAY_ID`, `SMS_GATEWAY_PWD`, `DATABASE_URL`.
  `NEXT_PUBLIC_*` are inlined at build time, so changing them needs a redeploy, others need
  `sudo systemctl restart checkin`.
- **Deploy:** from the repo, commit first, then `bash scripts/deploy-linode.sh`. It uploads `git archive HEAD`,
  runs `npm ci` + `npm run build` on the server (a few minutes), switches `/home/deploy/current` and restarts
  the service. Old releases are pruned (last 3 kept). `git push` does not deploy anything. After a schema change
  run `POST /api/admin/db-setup` once from an admin session.
- **Backups:** cron (user `deploy`) runs `/home/deploy/tools/backup-db.sh` at 02:30 IST into
  `/home/deploy/backups` (gzip SQL, 14 days). Restore: `gunzip -c file | psql "$DATABASE_URL"`.
- **TLS:** Let's Encrypt via certbot (webroot, auto-renew timer; `certbot renew --dry-run` passes). The current
  chain is the new ISRG Root YE/X2 hierarchy, which Windows 7 does not trust: the hotel PCs needed
  `certutil -addstore -f Root isrgrootx1.cer` (and .NET 4.8 / TLS 1.2 for the SMS program).
- **Database copy history:** data was copied from Netlify's Postgres on 21 Oct 2026 (sms_messages 43,945 rows from
  Netlify, ids below 1,000,000; Linode ids started at 1,043,142 so new rows never clash).

### Old: Netlify (gone)
- The Netlify project `checkin-admin-cs` (and with it the old database and the temporary
  `/api/admin/export-all` route used for the copy) was **deleted on 22 Oct 2026**. The team Checkinwebsite
  is on a scheduled downgrade to Free (2 Nov 2026). Do not recreate it: `netlify.toml` and the
  `NETLIFY_DB_URL` fallback in `lib/db.ts` are only left over from that time. The same `/sms` and `/welcome`
  rewrites that `netlify.toml` repeated are served by `next.config.ts` on Linode.
- **Domain:** checkin.co.in is registered at **GoDaddy** (nameservers `domaincontrol.com`).
  There is no GoDaddy API access here; DNS edits are manual, done by the owner.
  `A @` -> 172.236.182.160 and `CNAME www` -> checkin.co.in since 21 Oct 2026. The temporary
  `_acme-challenge` TXT records were deleted on 22 Oct 2026 (certificate renewal uses HTTP, not DNS).
- The owner also has a **Hostinger** account (arcoautozone.in/.com, carspareparts.co.in,
  and a KVM 2 VPS running WordPress). Unrelated to this project — do not touch it.

## Environment variables

`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SMS_API_KEY`,
`DATABASE_URL` (from Neon), optional `DB_POOL_MAX`, `SITE_URL`, `OTP_SKIP`.

Push notifications additionally need `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY` (server) and `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_VAPID_KEY` (client). **All of these are set in `/home/deploy/checkin.env`** (once Vercel, then Netlify) and push has been confirmed working on a real Android phone.

Firebase project is **`checkin-3715a`**, service account
`firebase-adminsdk-u7h1t@checkin-3715a.iam.gserviceaccount.com`. The downloaded service
account JSON lives at `~/Downloads/checkin-3715a-firebase-adminsdk-u7h1t-b90d130418.json`
on the owner's Mac — it is the only local copy of the private key, and it is **not** in the
repo. Regenerate it from the Firebase console if it is ever lost.

Two Vercel CLI traps when setting these: `NEXT_PUBLIC_*` variables are rejected as
"sensitive", so they need `--no-sensitive --visibility config`; and `FIREBASE_PRIVATE_KEY`
starts with `-----BEGIN`, which the CLI reads as a flag, so it must be piped through stdin
rather than passed with `--value`. Always confirm with `vercel env ls` afterwards — adds
can fail silently.

## Guest login and push

`/user/login` takes a mobile number, issues a six-digit OTP into `otp_codes`, and
`/user` shows that number's messages plus a "turn on notifications" button. The button
asks for browser permission, gets an FCM token and stores it in `device_tokens`.
`lib/sms-insert.ts` then pushes to every token on that number after each insert, logging
outcomes to `notification_log`.

`OTP_SKIP` is **false** (set 2 Oct 2026): codes are really verified and the code is never returned
to the browser or shown on the site. Setting `OTP_SKIP=true` again would re-open "any code works",
so don't. Since 21 Oct 2026 the OTP is also **sent by SMS** through the Chartered Info gateway
(`lib/sms-gateway.ts`, DLT template 1777179251415235321, header CHKIIN, login in `SMS_GATEWAY_ID` /
`SMS_GATEWAY_PWD`), for guest login and for BuildKhata's "Forgot password". A failed send never blocks
login: admins can still read the code on the Web Users page / BuildKhata users page, and
`/api/admin/sms-gateway-log` shows what the gateway answered (balance problems show up there).
Guests can also log in with a password (admin can create accounts with one) or a magic link.

FCM uses the HTTP v1 API with a service account; `lib/fcm.ts` mints the Google OAuth token
itself with `jose`, so `firebase-admin` is deliberately not a dependency. Dead tokens are
deleted when Google reports UNREGISTERED.

Multi-login behaviour is tested and works: one number may register up to 20 devices and
every one of them is pushed; different numbers can be logged in at the same time and never
see each other's messages; and if a second number logs in on a browser that already has a
token, the token moves to the new number (`ON CONFLICT (token) DO UPDATE`). Push failures
never fail the insert — the vendor always gets `code: 0`.

Note that `NEXT_PUBLIC_*` values are inlined at build time, so changing them needs a real
rebuild. When push silently does nothing, check in this order: the JSON response's `push`
field (`no devices registered` means the browser never registered), then the browser's own
permission state — the toggle prints a diagnostics line (`permission · serviceWorker ·
push · secure`) under the button for exactly this.

## Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | — | admin login, sets a 12h signed JWT cookie |
| `POST /api/auth/logout` | — | clears the cookie |
| `GET /api/sms/export` | admin session | CSV of the current filter |
| `POST /api/admin/db-setup` | admin session | applies `db/schema.sql`, `?seed=1` adds demo rows. Idempotent. |
| `POST /api/admin/clear-sms` | admin session | deletes every message; body must be `{"confirm":"DELETE"}` |
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
- **Netlify/Vercel "secret" env values cannot be read back by the CLI**: `netlify env:list` returned `********`
  placeholders for them, which silently ended up in the server env file and made the SMS gateway answer
  "Invalid User Id" (fixed 22 Oct 2026). When copying env vars between hosts, check no value starts with `*`.
  The Chartered Info login (`SMS_GATEWAY_ID` / `SMS_GATEWAY_PWD`) now lives only in `/home/deploy/checkin.env`
  (same login as the hotel PCs' `send_sms_config.txt`).
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

Live and verified end to end:

- Public site at `/` (restored 2023 snapshot), admin at `/admin`, guest area at `/user`.
- Both insert APIs, CSV export, filters, clear-messages action.
- Guest login by mobile number, device registration, and **real push delivered to an
  Android phone** (`{"push":{"sent":1,"failed":0}}`).

The database is **empty** — every demo and test row was cleared after testing.

**Pending, in the owner's priority order:**

1. ~~Real OTP sending~~ — done 21 Oct 2026 (see "Guest login and push").
2. **The homepage Flash banner.** The 2023 site embeds `flash/checkin banner.swf`, which no
   browser can play, leaving a blank band on the homepage. The owner asked for a static
   image in its place; not done yet.
3. **Legacy Cloud Messaging API** is still enabled in Firebase and its server key was
   visible in a screenshot the owner shared. It was deprecated in 2024 and nothing here
   uses it — worth disabling.

Also raised earlier: pulling logs directly from the SMS provider (MSG91/Textlocal/
Fast2SMS/Twilio — not chosen), serving the same API on hotelarcopalace.com, and more admin
pages (bookings, guests, reports).

## BuildKhata users (added 21-22 Oct 2026)

BuildKhata (`/build`, APK at `/downloads/BuildKhata.apk`) has its own users in `build_users`
(usernames, mobile number, `password_hash`). Admins add/switch off users and blank passwords at
`/mng-x7k9/build-setup`. A **blank password** (`password_hash = ''`) signs in with an empty password; the app
then asks for a new one. "Forgot your password?" sends an OTP to the saved mobile (table `build_otps`), and a
right OTP clears the password and signs the user in. Do not press the old "Create tables + 5 users" button
casually: it resets all five original passwords and re-activates switched-off users.
