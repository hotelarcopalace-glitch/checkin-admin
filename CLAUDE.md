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
| `POST /api/ascan/<code>` | pairing code | phone page posts the raw Aadhaar QR text for one hotel PC (see "Aadhaar QR relay") |
| `GET /api/ascan/<code>` | pairing code | checkin.exe polls; returns the QR text once (`200 text/plain`) or `204` |
| `POST /api/aimg/<code>?side=f\|b` | pairing code | phone page posts one JPEG of the guest's ID card, front or back (see "Aadhaar QR relay") |
| `GET /api/aimg/<code>` | pairing code | checkin.exe polls; returns one photo once (`200`, `Content-Type: image/jpeg; side=f\|b`) or `204` |

`SMSInsert` is also served at `/api/sms/insert` and `/newadmin/api/sms/SMSInsert`;
all three share `lib/sms-insert.ts`. It mirrors the contract of the owner's existing
hotelarcopalace.com API so the SMS vendor needs no changes. It is deliberately
unauthenticated at the owner's request — only a 60/minute per-IP limit guards it.

## Aadhaar QR relay (added 12 Nov 2026)

Lets a receptionist scan a guest's Aadhaar QR with a **phone** and have the details land in
checkin.exe's check-in screen (F8 there). Pieces:

- `app/s/[code]/page.tsx` — the phone page `https://checkin.co.in/s/<code>`. Two ways to scan: the live
  back camera (asked for at up to 2560x1440; the centre square of each frame is decoded) and a
  "Photo lekar scan karein" button (`<input capture>`, the phone's own camera app at full resolution).
  It posts the raw QR text to the API, decodes nothing into fields and keeps nothing.
  Decoder is **`zxing-wasm`** (ZXing-C++). The first version used `qr-scanner` and could not read real
  Aadhaar cards: on photos of two real cards it failed almost every attempt while ZXing read both every
  time, so do not go back to it. The `.wasm` is served by us from `public/zxing/` (gitignored), copied
  from `node_modules` by `scripts/copy-zxing.mjs` on `prebuild` / `predev`.
  `next.config.ts` gives `/s/*` its own `Permissions-Policy: camera=(self)`; every other page stays `camera=()`.
- `app/api/ascan/[code]/route.ts` + `lib/aadhaar-relay.ts` — the relay. The text is held **only in
  this process's memory** for at most 90 seconds and deleted when the PC fetches it. Never in
  Postgres, never logged: it is Aadhaar data and must not reach a backup. This relies on production
  being a single `next start` process; a multi-instance host would need a shared store.
- `<code>` is 12 characters (`A-Z` `2-9` without `O I 0 1`), generated once per hotel PC by
  checkin.exe (file `AADHMOB_<COMPUTER>.TXT` in its data folder) with a crypto RNG. It is the only
  credential; only text shaped like an Aadhaar QR (old XML, or the all-digits secure QR) is accepted.
- checkin.exe side: `D:\CHECKIN\AADHAR.PRG` (polls with `curl` about every 2 s while its scan box is open).
- **Driving licence QR (added 14 Nov 2026).** The same page and relay also carry the QR on an Indian
  driving licence (Sarathi e-DL / smart card): `Name:<name>,\nDLNo:<number>,\nDOB:<DD-MM-YYYY>` - only
  those three fields exist in it. `looksLikeDlQr` in `lib/aadhaar-relay.ts` and `isIdQr` in the page
  must stay in step with `DlParse` in `D:\CHECKIN\AADHAR.PRG`. Anything else is still refused (422).
- **Voter ID (added 22 Nov 2026).** The same page and relay carry a voter ID card (EPIC) too. It gives
  the **card number only** (no name, address or date of birth; the hotel types those). Three shapes:
  the QR of newer cards = base64 of AES-128-CBC over `{"epic_no":"ABC1234567","unique_generated_id":n}`
  with one fixed key for every card (public decoder: github.com/captn3m0/epicqr, MIT); open JSON with an
  `"epic"` key; or the bare number from the 1D barcode of older cards (the page looks for Code 128/39/93
  only when a frame has no QR, and takes it only if it is shaped like a card number). `looksLikeVoterQr`
  (lib), `isVoterQr` / `epicNo` (page) and `VoterParse` (`D:\CHECKIN\AADHAR.PRG`) must stay in step.
  Other base64 text is refused: it has to decrypt to that JSON. Checked against the decoder's public
  test vector only, **not against a real card** (the Election Commission has not published the format).
- **Over-inked QR (added 22 Nov 2026).** Locally re-printed PVC Aadhaar cards often have the black of
  the dense secure QR run into the white; the normal read then fails however the phone is held.
  `lib/qr-rescue.ts` makes thinner-black copies of the picture (`gamma2`, `gamma3thin`, `cut45`) and
  the page runs ZXing on each: on every third live frame once 4 seconds have passed without a read,
  on every full-size still, and on a taken photo at several sizes (own size, halved, enlarged up to
  4500 px - the one-pixel thinning needs several pixels per module). Evidence: a simulated print
  (plain read 9 of 24 pictures, with the copies 19) and a screenshot of one real card that would not
  scan, which the photo path now reads (3051 digits, parsed by checkin.exe). Not yet confirmed on that
  card with a live phone camera. It is slow (about a second per 1600 px picture), so keep it behind
  the normal read, never in front of it.
- **Passport (added 24 Nov 2026).** Two ways, both ending as text on the same relay:
  (1) the green "Passport" button takes a photo of the photo page; `tesseract.js` reads the two
  44-character lines at the bottom (MRZ) and `lib/mrz.ts` repairs the usual OCR slips and **proves
  line 2 by its check digits** (number, birth date, expiry) before anything is sent; the names on
  line 1 have no check digit, so the page tells the hotel to look at the name. The picture never
  leaves the phone. (2) The barcode on the last page of an Indian passport (Code 128) holds the
  passport number only: read by the normal scan, name typed on the computer.
  `tesseract.js` is loaded only when the button is pressed; its worker, engine and English model are
  copied to `public/tess/` (gitignored, about 15 MB) by `scripts/copy-tess.mjs` on `prebuild` /
  `predev`; a phone downloads about 7 MB the first time. `looksLikePassport` (lib) and `PassParse`
  (`D:\CHECKIN\AADHAR.PRG`) must stay in step.
  What a real Indian passport taught (24 Nov 2026, one photo, page lying on its side with a shadow
  across it) - all of it is in `lib/mrz.ts`, do not simplify it away:
  a shadow made the OCR lose the right third of both lines (`flattenLight` evens the light first);
  the English model reads the passport font's `<` as `K` or `<K`, so names got stray K's or ran
  together (second reading without K + `mergeNameLines`); a stray letter still stuck to a name now
  and then, so the names are checked against the page's own printed text above the lines
  (`mrzCheckNames`: a letter is dropped only when the page shows the shorter word), with a
  three-size majority vote (`mrzVote`) when that does not settle it. On that photo 36 of 36 crops
  and sizes then gave the right name from a single reading. The page guesses the orientation from
  the picture's shape (a tall picture = page on its side) because every wrong guess costs a
  reading: about 7 s in a desktop browser. One passport is one passport: other countries' pages
  and worse photos are untested, and the page says so when the names are not all found printed.
- **ID card photos (added 14 Nov 2026).** The same phone page has "Front photo" / "Back photo" buttons
  (the phone's own camera app). The page shrinks the picture to a JPEG of at most about 700 KB
  (1600 px, then 1280 / 1024 if still too big) and posts it to `app/api/aimg/[code]/route.ts`.
  checkin.exe's "ID Photo" box (F4 in the guest box, `D:\CHECKIN\EVISIT.PRG`) polls `GET /api/aimg/<code>`
  about every 1.5 s and saves the file in the hotel's own `DATA\IDPROOF\` folder. Same rules as the
  QR text: **memory only** (`lib/aadhaar-relay.ts`, 3 minutes at most, deleted when fetched, never
  Postgres, never logged), JPEG only, 900 KB limit. Keep that limit under nginx's body limit (1 MB
  by default) and the store bounded (40 pictures): these are images of ID cards.

Verified: the photo path with photos of two real cards (old XML QR), end to end through the relay.
Not verified yet: the live camera on a real phone, the newer all-digits "secure QR", and iPhone/Safari.

## UPI payment request page `/pay` (added 27 Nov 2026)

`app/pay/page.tsx` (+ `layout.tsx`). checkin.exe (bill screen > F9 = UPI QR > W) sends the guest a WhatsApp
link `https://checkin.co.in/pay#<base64url of "1|<UPI ID>|<name>|<amount>|<bill no.>">`. Everything is after the
`#`, so the server never sees it and nothing is stored or logged. The page (client only) shows the name, bill
number, amount and UPI ID, a "Pay" button (`upi://pay?pa=..&pn=..&am=..&cu=INR&tn=..`, opens the phone's UPI
app) and a QR code of the same link (auto on a computer, behind "Show QR code" on a phone) made in the browser
with the writer half of zxing-wasm (`public/zxing/zxing_writer.wasm`, copied by `scripts/copy-zxing.mjs`).
No money passes through the site and the site cannot tell whether the guest paid: the hotel sees that in its
own UPI app. `next.config.ts` gives `/pay` `noindex` and `Referrer-Policy: no-referrer`.
The link format must stay in step with `PayLink()` in `UPIQR.PRG` (in `D:/CHECKIN`); bump the leading `1` if it changes.
Anyone can make such a link with any UPI ID, so the page shows the UPI ID plainly and tells the guest to check
the name in the UPI app; do not add wording that suggests the site vouches for the payee.

## Office Sync (added 28 Nov 2026)

A one-way, encrypted mirror of a hotel's CHECKIN data folder, so the owner's office can open the same desktop
program on a view-only copy. Desktop side: `D:\CHECKIN\CKSYNC.PRG`, compiled into **UTILITY.exe** since 28 Nov 2026
(`UTILITY /SYNC:SEND | /SYNC:GET | /SYNC:SETUP`; menu under UTILITY > Misc. > Office Sync, Main-rights users only), and
`OFFSYNC.PRG` inside CHECKIN.exe. There is no separate CKSYNC.exe any more.

- **Flow:** hotel PC pushes -> this server stores -> office PC pulls. Nothing ever flows back to the hotel.
- **What is stored:** `SYNC_DIR` (default `~/syncdata`, i.e. `/home/deploy/syncdata`, outside the release folders):
  `<hotel id>/manifest.json` and `<hotel id>/chunks/<aa>/<64 hex>`. Files are cut into 256 KB chunks, each zlib +
  AES-256-GCM encrypted on the hotel PC and named by an HMAC of its content. The key never comes here (the hotel PC
  shows an "office key" that is typed into the office PC), so guest data cannot be read on the server or in backups.
  About 200 MB of DBF data is ~7 MB here.
- **Auth:** table `sync_hotels` holds SHA-256 hashes of two tokens per hotel: push (hotel) and pull (office, read
  only). A hotel is created on `/mng-x7k9/sync`, which shows a one-time setup code `<id>-<24 hex>`; the hotel PC
  trades it for its token hashes at `POST /api/sync/<id>/register`. "New setup code" invalidates both tokens.
- **Routes** (`lib/sync-store.ts`): `POST /api/sync/<id>/have` (which chunk ids are missing), `PUT|GET
  /api/sync/<id>/chunk/<chunk id>`, `PUT|GET /api/sync/<id>/manifest` (`?ts=` -> 304 when unchanged; PUT answers 409 +
  `missing` until every named chunk is there), admin `GET|POST|PATCH|DELETE /api/admin/sync-hotels`.
- **Clean-up:** chunks no longer named by the manifest are deleted once a day old, at the next manifest PUT.
  `used_bytes` / quota (default 1024 MB per hotel) are refreshed then too.
- The table was created by hand with psql on 28 Nov 2026 (it is also in `db/schema.sql` for `db-setup`).
- **Owner phone app (`/owner`, added 28 Nov 2026):** a PWA page (`app/owner/page.tsx`, manifest in `public/owner/`)
  that shows the hotel's Night Audit Summary (sold rooms, collection, sales; day / month / year to date) for the last
  ~60 days. The hotel PC's sender runs `CHECKIN.EXE /MOBSUM` (the report itself, headless) at every sync, encrypts the
  lines with a **mobile key** (separate from the office key: `M = HMAC(K,"cksync-mobile-v1")[:20]`, read token
  `HMAC(M,"cksync-mread-v1")`, AES key `HMAC(M,"cksync-menc-v1")`) and `PUT`s `/api/sync/<id>/summary`
  `{rt: sha256(read token), blob}`; the server keeps `<id>/summary.json` and `sync_hotels.mobile_hash` /
  `summary_at`. The phone `GET`s it with its token and decrypts in the browser (WebCrypto). The key is shown (with a
  QR of `https://checkin.co.in/owner#k=<key>`) on the hotel PC: UTILITY > Misc. > Office Sync > 7. The two columns
  were added by hand with psql (also in `db/schema.sql`).
- Not in the database backup: `syncdata` is only a mirror; a lost copy is rebuilt by the hotel PC's next push.

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
