# Paystubs USA API

Express 5 + TypeScript modular monolith with PostgreSQL (Prisma 7), Stripe, and an in-process job runner. No Redis: jobs, rate limits, idempotency and cron locking all live in Postgres.
The source of truth is `docs/server/BACKEND_ARCHITECTURE_AND_API_SPECIFICATION.md`.

## Requirements

- Node 24+ (runs `.ts` directly; the only build step is `prisma generate`)
- PostgreSQL 15+ (the migration enables `pg_trgm`)
- Stripe test account and the Stripe CLI for local webhooks
- For PDF rendering: a Chromium (`npx playwright install chromium` or `CHROMIUM_EXECUTABLE_PATH`) and the renderer bundle (`RENDERER_BUNDLE_PATH`, built from `packages/documents`)

## Setup

```bash
cd server
npm install
npx prisma generate
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

## Tests

```bash
npm run typecheck
npm run test:unit                 # no database needed
npm run test:integration          # needs .env.test
```

`.env.test` needs only `DATABASE_URL`, and the database name must contain `test` (the suite truncates tables), e.g. `postgresql://postgres:…@localhost:5432/paystubsusa_test`. Create the database first; the run migrates and seeds it. Without `.env.test`, integration suites are skipped.

## Deployment (Coolify)

The app is deployed from this directory with Coolify's Node build pack: it runs `npm run build` (`prisma generate`) and then `npm start`.

**Pre-deployment command:** `npm run db:migrate` (applies pending migrations before the new version starts).

**Persistent storage:** uploaded files live on the container's disk, so add a volume or redeploys will delete them. In the application's *Persistent Storage* tab add a volume mounted at `/app/.storage` and set `LOCAL_STORAGE_DIR=/app/.storage`. `.mail/` needs no volume: production uses SMTP. Local storage is a single disk, so run one instance (no horizontal scaling) unless the storage driver changes.

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

**Gmail App Password:** turn on 2-Step Verification for the Google account, open <https://myaccount.google.com/apppasswords>, create an app password, and use the 16 characters (no spaces) as `SMTP_PASSWORD`. Gmail sends as `SMTP_USER`, so set `MAIL_FROM` to that address (or a "Send mail as" alias configured in Gmail). Gmail limits sending to roughly 500 messages a day.

On startup the API checks the SMTP login and logs `SMTP connection verified`, or `SMTP verification failed` with the reason. A failed send is retried by the job queue (up to 5 attempts) and the error is stored on the `email_deliveries` row; there is no fallback provider.

## Layout

`src/modules/<module>/` holds `*.routes.ts → *.controller.ts → *.service.ts → repositories/*.repository.ts` (interface) `→ repositories/prisma-*.repository.ts`. Only Prisma repositories touch the database. `src/container.ts` wires everything; `src/integrations/` wraps Stripe, SMTP (Nodemailer), local file storage and Playwright behind interfaces that tests replace.

Background work: `jobs` table polled with `FOR UPDATE SKIP LOCKED` (`render-document`, `send-email`); node-cron tasks (`src/jobs/retention.job.ts`) run under a Postgres advisory lock so one instance runs each tick.
