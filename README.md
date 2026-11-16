# Paystubs USA API

Express 5 + TypeScript modular monolith with PostgreSQL (Prisma 7), Stripe, and an in-process job runner. No Redis: jobs, rate limits, idempotency and cron locking all live in Postgres.
The source of truth is `docs/server/BACKEND_ARCHITECTURE_AND_API_SPECIFICATION.md`.

## Requirements

- Node 24+ (runs `.ts` directly; `npm run build` runs `prisma generate` and builds the offline PDF renderer)
- PostgreSQL 15+ (the migration enables `pg_trgm`)
- Stripe test account and the Stripe CLI for local webhooks
- For PDF rendering: Chromium (system install, Docker image, or `npx playwright install chromium`) and the renderer bundle under `dist-renderer/` (built from `renderer/` in this repo)

## Setup

```bash
cd server
npm install
npm run build                 # prisma generate + offline renderer → dist-renderer/
cp .env.example .env          # then fill in the values
npm run keys:generate         # paste the output into .env
createdb paystubsusa          # or create it in pgAdmin
npm run db:migrate
npm run db:seed               # catalog, templates, optional first admin (SEED_ADMIN_*)
npm run dev                   # http://localhost:4000/api/v1
```

Local webhooks: `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe` and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`.

Files (avatars, PDFs) are stored under `LOCAL_STORAGE_DIR` (`.storage/`). Email goes through SMTP (`MAIL_DRIVER=smtp`), or in development is written to `.mail/` (`MAIL_DRIVER=log`). Production refuses to start without SMTP, `PUBLIC_API_URL` and secure cookies.

PDF keys use: `documents/{email-prefix}_{id6}/{YYYY}/{MM}/{type}_{NNN}.pdf`.
The email local-part is the visible owner folder; `id6` (user id or email hash) prevents collisions when two people share the same prefix. Access is only via signed `/api/v1/local-files` links — never browse the filesystem directly.

To remap legacy UUID / dated-name folders:

```bash
node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs          # dry-run
node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs --apply
node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs --apply --delete-old
```

## PDF renderer (backend-owned)

The offline Playwright bundle lives in this repository. Coolify deploys the API alone; the frontend repo is not required to generate PDFs.

| Piece | Location |
|---|---|
| Source | `renderer/src/` (entry: `renderer/src/renderer/main.jsx`) |
| Vite config | `renderer/vite.config.js` |
| Build output | `dist-renderer/index.html` (+ `renderer.js`, `renderer.css`, assets) |
| Runtime loader | `src/integrations/renderer.ts` (`PlaywrightRenderer`) |

```bash
npm run build:renderer        # Vite IIFE → dist-renderer/
npm run build                 # prisma generate && build:renderer
npm run smoke:render          # render paystub / w2 / nec1099 / direct_deposit sample PDFs
```

Contract: the bundle exposes `window.renderDocument(payload)` and sets `[data-ready="true"]` on `#root` when fonts/images are ready. Playwright loads it via `file://` with network aborted except `file:` / `data:`.

### `RENDERER_BUNDLE_PATH`

Defaults to an absolute path resolving to `<server>/dist-renderer/index.html` (from `src/config/env.ts`). Override only if the bundle is relocated. Production startup fails when `JOBS_ENABLED` and the file is missing (`npm run build:renderer` was not run).

### Chromium

| Environment | Recommendation |
|---|---|
| Local (Windows/macOS) | `npx playwright install chromium` and leave `CHROMIUM_EXECUTABLE_PATH` unset |
| Docker / Coolify | Use the repo `Dockerfile` (Debian Chromium at `/usr/bin/chromium`) |
| Custom host | Set `CHROMIUM_EXECUTABLE_PATH` to the browser binary |

`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in the Dockerfile avoids bundling a second Chromium. Launch args still include `--disable-dev-shm-usage`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Renderer bundle not found at …` | From `server/`: `npm run build:renderer` (or full `npm run build`) |
| Chromium launch / missing libs | Install Chromium or set `CHROMIUM_EXECUTABLE_PATH`; on Linux use the Dockerfile |
| Wrong layout vs old frontend bundle | Rebuild after pulling `renderer/` changes; do not point at `../web/dist-renderer` |
| Windows: Application Control blocks `rollup-*.node` | Coolify/Docker Linux builds are unaffected. Locally, unblock the Rollup native binary or reuse an already-allowed copy under `node_modules/@rollup/` |

## Tests

```bash
npm run typecheck
npm run test:unit                 # no database needed
npm run test:integration          # needs .env.test
npm run smoke:render              # needs Chromium + dist-renderer/
```

`.env.test` needs only `DATABASE_URL`, and the database name must contain `test` (the suite truncates tables), e.g. `postgresql://postgres:…@localhost:5432/paystubsusa_test`. Create the database first; the run migrates and seeds it. Without `.env.test`, integration suites are skipped.

## Deployment (Coolify)

**Required for PDFs:** the running image must include Chromium. Your crash `Chromium not found` means Coolify is still on **Nixpacks**, not the Dockerfile image.

### Coolify → switch to Dockerfile
1. Open the API application → **Configuration** → **General**.
2. Under **Build pipeline**, set **Build strategy** (Build pack) to **Dockerfile** (not Nixpacks / Railpack).
3. **Base Directory:** `/` (server repo root) — or `/server` only if Coolify points at the monorepo parent.
4. **Dockerfile Location:** `/Dockerfile` (relative to Base Directory).
5. **Port:** `3000` (match `PORT`).
6. Environment (set explicitly; do not leave blank):
   - `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
   - `LOCAL_STORAGE_DIR=/app/.storage`
   - `TRUST_PROXY=1`
7. **Persistent Storage:** mount a volume at `/app/.storage`.
8. Save → **Redeploy** (force rebuild without cache if the old Nixpacks image is sticky).

A `nixpacks.toml` is included as a fallback Chromium install if you stay on Nixpacks temporarily — **Dockerfile is still preferred**.

| Setting | Value |
|---|---|
| Build strategy | **Dockerfile** |
| Dockerfile location | `/Dockerfile` at the server repo root |
| Start | image `CMD` → `npm start` |
| Pre-deploy | `npm run db:migrate` |
| Port | `3000` |
| Persistent storage | `/app/.storage` |

`npm run build` inside the image runs `prisma generate` and produces `/app/dist-renderer`. Env defaults in the image:

- `RENDERER_BUNDLE_PATH=/app/dist-renderer/index.html`
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
- `LOCAL_STORAGE_DIR=/app/.storage`
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`

**Persistent storage:** mount a volume at `/app/.storage` and set `LOCAL_STORAGE_DIR=/app/.storage`. Redeploys wipe container disk otherwise. Local storage is a single disk — run one instance unless the storage driver changes. `.mail/` needs no volume in production (SMTP).

**Environment variables** (set them in Coolify; `.env` is not used in the container):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL`, `CORS_ORIGINS` | Frontend origin, e.g. `https://paystubsusa.com` |
| `PUBLIC_API_URL` | Public API origin, e.g. `https://api.paystubsusa.com` |
| `TRUST_PROXY` | `1` (Coolify's proxy sits in front of the app) |
| `COOKIE_SECURE` | `true` |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `CODE_PEPPER`, `ENCRYPTION_MASTER_KEY` | From `npm run keys:generate`; never reuse development values |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Live (or test) Stripe keys |
| `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR` | `local`, `/app/.storage` |
| `MAIL_DRIVER` | `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `smtp.gmail.com`, `587`, `false` |
| `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Gmail address, its App Password, the same Gmail address |
| `SUPPORT_EMAIL` | Address that receives contact-form messages |
| `RENDERER_BUNDLE_PATH` | Optional; image default `/app/dist-renderer/index.html` |
| `CHROMIUM_EXECUTABLE_PATH` | Set to `/usr/bin/chromium` (Dockerfile). **Do not leave blank in Coolify** — an empty value clears the image default and Playwright then looks for a missing browser cache |
| `RENDER_CONCURRENCY` | Optional; default `2` |
| `JOBS_ENABLED` | `true` (default) so PDF jobs run |

**Health check after deploy:** `GET /healthz` (liveness) and `GET /readyz` (DB). Confirm a test order’s document reaches `ready`, or run an admin regenerate. Failed documents from before this fix remain regenerable.

**Gmail App Password:** turn on 2-Step Verification for the Google account, open <https://myaccount.google.com/apppasswords>, create an app password, and use the 16 characters (no spaces) as `SMTP_PASSWORD`. Gmail sends as `SMTP_USER`, so set `MAIL_FROM` to that address (or a "Send mail as" alias configured in Gmail). Gmail limits sending to roughly 500 messages a day.

On startup the API checks the SMTP login and logs `SMTP connection verified`, or `SMTP verification failed` with the reason. A failed send is retried by the job queue (up to 5 attempts) and the error is stored on the `email_deliveries` row; there is no fallback provider.

If Coolify cannot use a Dockerfile, you must install Chromium (and its shared libraries) on the host image yourself and set `CHROMIUM_EXECUTABLE_PATH`. Node-only Nixpacks builds do **not** include Chromium.

## Layout

`src/modules/<module>/` holds `*.routes.ts → *.controller.ts → *.service.ts → repositories/*.repository.ts` (interface) `→ repositories/prisma-*.repository.ts`. Only Prisma repositories touch the database. `src/container.ts` wires everything; `src/integrations/` wraps Stripe, SMTP (Nodemailer), local file storage and Playwright behind interfaces that tests replace.

`renderer/` is the offline document UI compiled into `dist-renderer/` for Playwright. Background work: `jobs` table polled with `FOR UPDATE SKIP LOCKED` (`render-document`, `send-email`); node-cron tasks (`src/jobs/retention.job.ts`) run under a Postgres advisory lock so one instance runs each tick.
