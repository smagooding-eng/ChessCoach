# ChessScout on Oracle Cloud

One Oracle "Always Free" ARM server (2 cores, 12 GB) runs everything Render and Neon do today:

- **Live API** (`main` branch) at `api.chessscout.net`
- **Preview API** (`preview` branch) at `api-preview.chessscout.net`, on its own copy of the database. It never emails or notifies members, never charges cards, and doesn't run the Lichess bot.
- **Postgres** on the same machine, backed up every hour (48 hourly + 14 daily copies, plus copies in Cloudflare R2).

The website stays on Cloudflare: `chessscout.net` is built from `main` and `preview.chessscout.net` from `preview`.

Everything below runs from **Git Bash on your PC** with `bash ~/Desktop/ChessCoach/ops/oracle/pc.sh <command>`. Run `git pull` in `~/Desktop/ChessCoach` first so the scripts are current. This replaces the earlier zip kit; don't run that installer.

---

## A. Downtime alerts (works now, on Render too)

1. Install the free **ntfy** app on your phone (Play Store / App Store).
2. Make up a private topic name, e.g. `chessscout-alerts-` plus 12 random letters/numbers. In ntfy, tap **+** and subscribe to it.
3. Cloudflare → Workers & Pages → **chesscoach** → Settings → Variables and secrets → **Add** → type *Secret*:
   - `NTFY_TOPIC` = your topic name
   - optional `ALERT_EMAIL` = your email (ntfy forwards each alert)
4. chesscoach → Settings → **Trigger events** → Add → Cron trigger → **Every minute**. From then on, every minute Cloudflare checks the API **and its database**:
   - **"ChessScout is DOWN"** (urgent) after two failed checks 15 s apart
   - a reminder every 30 min while it stays down
   - **"ChessScout is back up"** when it recovers

   To test, send yourself a message from the ntfy app's topic screen.

## B. Preview, then a release every other week

- Day-to-day changes go to the **`preview`** branch. They show up on `preview.chessscout.net` (website) and, once the Oracle server exists, on the preview API. Until then, the preview site talks to the live API.
- **Release:** GitHub → Actions → **Release preview to live** → Run workflow. It merges `preview` into `main`, and Cloudflare (website) plus the API server deploy from `main`.
- **Emergency fix:** straight to `main`. **Bring main's fixes into preview** runs by itself, so the next release keeps the fix.

### Setting up `preview.chessscout.net` (once)

**Done (Nov 22).** For reference, the setup is:

- Worker **chesscoachpreview**, production branch `preview`, builds for other branches off (same on **chesscoach**, so it only builds `main`)
- Build command: same as chesscoach's. Deploy command: `npx wrangler deploy --name chesscoach-preview`
- Build variable `SKIP_DEPENDENCY_INSTALL` (as on chesscoach); add `PREVIEW_API_URL=https://api-preview.chessscout.net` once the Oracle preview server is running
- `preview.chessscout.net`: a route `preview.chessscout.net/*` on the chessscout.net zone, plus a proxied DNS record `AAAA preview → 100::`
- No `NTFY_TOPIC` or cron on it, so only the live Worker sends alerts.

Signing in on preview: in Google Cloud Console → Credentials → your OAuth client, add the redirect URI `https://api-preview.chessscout.net/api/auth/google/callback`.

## C. The Oracle server (practice first; Render stays live meanwhile)

1. `pc.sh key`. It prints your public SSH key.
2. **Oracle Cloud:** sign up, then **upgrade to Pay As You Go**. It stays $0 within the free limits, and it stops Oracle from reclaiming "idle" free servers.
   - Compute → Create instance
     - **Image:** Ubuntu 24.04 (aarch64)
     - **Shape:** VM.Standard.A1.Flex, **2 OCPU / 12 GB**
     - **Boot volume:** 100 GB
     - **Public IPv4:** on
     - **SSH key:** paste the key from step 1
   - Networking → your VCN → default **Security List** → add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
3. **Cloudflare DNS:** two **A** records to the server's IP, **DNS only (grey cloud)**: `api` and `api-preview`.
4. `pc.sh setup <IP>`. Installs Docker, Postgres 18, Caddy (HTTPS), the firewall, backups and the daily check (about 10 min).
5. **Settings from Render:**
   - Render → chesscoach-api → **Environment** → copy all into a text file, e.g. `~/Downloads/render.env`.
   - Optional for preview's Stripe: add `STRIPE_TEST_SECRET_KEY=`, `STRIPE_TEST_PUBLISHABLE_KEY=` and `STRIPE_TEST_WEBHOOK_SECRET=` lines.
   - Then `pc.sh env ~/Downloads/render.env` and **delete the file**.
6. `pc.sh alerts <your ntfy topic>`. The server warns you if the disk passes 80% or backups stop.
7. `pc.sh deploy preview`. This is **the first test build**, which proves the server builds on ARM. Then `pc.sh deploy prod`. The live one stays in **standby** (no emails, notifications, game polling or Lichess bot), so it can't double up with Render.
8. `pc.sh migrate`. A practice copy of the database from Neon, with a row-count comparison. Then `pc.sh refresh-preview` copies it into the preview database too.
9. `pc.sh ci-key`. Add the two secrets it prints to GitHub. From then on every push deploys by itself (main → live, preview → preview).
10. `pc.sh r2`. Off-server backups: create the R2 bucket `chessscout-backups` and an *Object Read & Write* token first.

Check any time with `pc.sh status` and `pc.sh logs prod`.

## D. Move day

**A week before:**
- A general "sometime this week" banner is up until Nov 30 (`notice` / `until` in `artifacts/chess-coach/public/maintenance.json`).
- Once the day is set, put the window in that file, e.g. `"start": "2026-12-06T02:00:00-05:00"`, `"end": "2026-12-06T03:00:00-05:00"`, and push. Members see a banner in their own time zone for 7 days, and an "upgrading" screen during the window. It goes away by itself when the API answers again.
- In Google Cloud Console, add the redirect URI `https://api.chessscout.net/api/auth/google/callback` (keep the Render one until the end).
- In Stripe, add a webhook endpoint `https://api.chessscout.net/api/stripe/webhook` with the same events as the Render one. Note its signing secret.

**In the window:**
1. Render → chesscoach-api → **Suspend**. Nothing more is written to Neon from here on.
2. `pc.sh migrate`. All tables should match this time.
3. On the server, put the new Stripe webhook secret in place:
   - `pc.sh ssh`, then `nano /opt/chessscout/prod.env` and update `STRIPE_WEBHOOK_SECRET`.
   - Make sure `CORS_ORIGIN=https://chessscout.net` and `LIVE_WS_ALLOWED_ORIGINS=https://chessscout.net` are there.
4. `pc.sh golive`. The Oracle server switches from standby to fully on.
5. **Point everything at `api.chessscout.net`** (ask Claude to do this in the repo; it's one commit):
   - `cloudflare/build.sh` (`LIVE_API`)
   - `cloudflare/wrangler.jsonc` (`API_URL`)
   - the fallbacks in `cloudflare/worker.ts`, `artifacts/chess-coach/src/lib/api.ts` and `src/main.tsx`
   - the GitHub workflows that call the API (traffic export, API check, DNS check, Studio render)
   - and `VITE_API_URL` in Cloudflare's build settings if it's set there

   Push it to **main** so it deploys right away.
6. **Test:** sign in with Google and with Lichess, import games, open a review, play a bot game, open Pro checkout (don't pay), and check your ntfy alert stays quiet.
7. Stripe → the old Render webhook → disable it.

**If something's wrong — rollback:** un-suspend Render, and revert the API-address commit. Members are back on Render/Neon within minutes. Anything written on Oracle in between would need copying back, so decide quickly.

**After a week stable:**
- Delete the Render service.
- Pay any open Neon invoices, then **delete the Neon project** (it bills until deleted).

## Day-to-day

| | |
|---|---|
| What's running | `pc.sh status` |
| Previous version back | `pc.sh rollback prod` |
| Fresh data on preview | `pc.sh refresh-preview` |
| Logs | `pc.sh logs prod` / `pc.sh logs preview` |

Security updates install themselves. A restart for kernel updates is up to you: run `sudo reboot` in `pc.sh ssh` at a quiet hour. Docker and Caddy come back by themselves.
