# Postman: Paystubs USA Backend API

| File | What it is |
| --- | --- |
| `Paystubs-USA-API.postman_collection.json` | The collection (150 requests, with tests) |
| `Paystubs-USA-Local.postman_environment.json` | `baseUrl = http://localhost:4000` |
| `Paystubs-USA-Development.postman_environment.json` | `baseUrl = https://dev-api.paystubsusa.example` (placeholder; set the real dev host) |
| `build-collection.mjs` | Generates the three JSON files. **Edit this, not the JSON.** |
| `validate.mjs` | Static checks: script syntax, declared variables, every request maps to an Express route, no secrets |
| `test-data/README.md` | Seed data, fixtures and where to find email codes |

There is deliberately no Production environment. The collection creates accounts, orders and contact messages.

```bash
cd server
node postman/build-collection.mjs   # regenerate after editing
node postman/validate.mjs           # static checks
```

## Import

1. Postman → **Import** → select the collection and both environment files.
2. Pick **Paystubs USA - Local** (or Development) in the environment selector. Every URL is `{{baseUrl}}/api/{{apiVersion}}/…`, so switching environments switches hosts. Health probes are at the root (`{{baseUrl}}/healthz`, `/readyz`), as in the server.
3. Keep **Settings → General → Cookies** enabled (the default). The refresh cookie lives in Postman's cookie jar.

## Environment variables you set

| Variable | Needed for |
| --- | --- |
| `adminEmail`, `adminPassword` (secret) | All admin requests: the admin created by `npm run db:seed` from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Leave empty to skip admin requests. |
| `stripeWebhookSecret` (secret, Local only) | Simulated payments: the same `whsec_…` as the server's `STRIPE_WEBHOOK_SECRET` |
| `allowDestructive` | `false` by default. Set to `true` to run the refund and subscription-cancel requests. |
| `emailVerificationCode`, `verificationCode`, `docAccessCode`, `resetToken` | Manual steps: values copied from emails (see below) |

Everything else (tokens, ids, generated test emails and passwords) is written by the scripts. Test accounts get random `qa.*@example.test` emails and random passwords on every run.

## How authentication works here

| Who | How the collection authenticates |
| --- | --- |
| Customer / admin | `Authorization: Bearer {{customerToken}}` / `{{adminToken}}` (15-minute access JWT from login, register or refresh) |
| Guest | `Authorization: Guest {{guestToken}}` (30-minute token from `POST /verifications/{id}/verify`) |
| Refresh session | HttpOnly `rt` cookie (Path `/api/v1/auth`), set by login and register. Postman's cookie jar sends it to `/auth/refresh` and `/auth/logout`. Scripts never read it, and it is not stored in a variable. |

`/auth/refresh` and `/auth/logout` also need `X-Requested-With: XMLHttpRequest` (the CSRF guard for non-browser clients). The requests send it, and one test proves the server rejects a request without it.

The cookie jar holds one `rt` per host, so the **last login owns the refresh cookie**. The collection logs in the admin before the customer.

## Running

**Single module:** right-click a folder → **Run folder**, or `npx newman run <collection> -e <env> --folder "Catalog"`. Folders read ids saved by earlier folders. If a variable is missing, a request **skips itself** with a console message naming the folder to run first; it does not fail.

**Full run (Collection Runner / Newman):** run the whole collection top to bottom. The order is Health → Auth → Accounts → Verification → Catalog → Orders → Payments → Documents → Subscriptions → Support → Public → Security & Access Control → Dashboard. Without the manual email codes, the run covers registration, login, refresh, logout, validation, catalog, quotes, access control and the admin read endpoints. It skips the purchase flow, which needs a verified email.

### Workflows with manual steps

Locally (`MAIL_DRIVER=log`) every email is a text file in `server/.mail/`; take the newest one.

1. **Customer purchase**
   1. Run **Auth → Register**, then **Auth → Email Verification → Resend Verification Code**.
   2. Put the 6-digit code from the email in `emailVerificationCode`, then run **Verify Email**.
   3. Run **Catalog**, **Orders**, **Payments** (the webhook simulation, Local only), **Documents** and **Security & Access Control**.
2. **Guest checkout:** run **Public → Guest Checkout → Send Checkout Code**. Put the code in `verificationCode`, then run the rest of that folder.
3. **Find Your Paystubs:** wait 30 s after the guest checkout code (per-email cooldown), then run **Send Document Access Code**. Put the code in `docAccessCode` and run the rest.
4. **Password reset:** run **Auth → Forgot Password**. Copy the `token=` value from the reset link into `resetToken`, then run **Reset Password**.

### Payments

Order creation returns a Stripe `clientSecret`; a browser confirms it with Stripe Elements. Postman can't do that, so there are two options:

- **Simulated webhook (Local only):** **Payments → Webhooks → Simulate payment_intent.succeeded** builds a `payment_intent.succeeded` event and signs it with `stripeWebhookSecret`, the same HMAC that Stripe uses. The server still verifies the signature, deduplicates the event and checks the amount. The server also fetches card details from Stripe, so the local server needs real Stripe **test** keys and the PaymentIntent must be one it created (it is: the id comes from `POST /orders`). The request skips itself unless `baseUrl` is localhost.
- **Real test payment:** run `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe` (use the `whsec_` it prints as the server's `STRIPE_WEBHOOK_SECRET`). Then run `stripe payment_intents confirm {{paymentIntentId}} --payment-method pm_card_visa`. Only a real test payment can be refunded through **Admin → Orders → Refund Order**.

## Folder map

The folder tree follows the backend modules (`src/modules/*`). There are no duplicates: public products and templates live in **Catalog**, and the customer's own orders, documents and payments live in **Orders**, **Documents** and **Payments** (the same endpoints the customer dashboard uses).

| Folder | Endpoints |
| --- | --- |
| Health | `GET /healthz`, `GET /readyz` |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/email/verification`, `/auth/email/verify` |
| Accounts | `GET /auth/me`, `PATCH /me`, `POST /me/password` |
| Verification | `POST /verifications`, `POST /verifications/{id}/verify` (negative cases; happy paths are in Public) |
| Catalog | `GET /catalog/products`, `GET /catalog/templates` |
| Orders | `POST /catalog/quote`, `POST /orders`, `GET /orders`, `GET /orders/{id}` (entitlements are part of the order detail) |
| Payments | `POST /webhooks/stripe`, `GET /payments`, `GET /payments/{id}` |
| Documents | `POST /documents` (spend a credit), `GET /documents`, `GET /documents/{id}`, `POST /documents/{id}/download` |
| Subscriptions | `GET /me/subscription`, `POST /me/subscription/checkout-session`, `POST /me/subscription/portal-session` |
| Support | `POST /contact-messages` |
| Public | Guest Checkout and Find Your Paystubs flows (reuse the endpoints above with a guest token) |
| Security & Access Control | Anonymous, guest, customer and second-customer access matrix (401 / 403 / 404) |
| Dashboard → Customer | `GET /me/dashboard` |
| Dashboard → Admin | `/admin/dashboard`, `/admin/customers`, `/admin/orders` (+ refunds), `/admin/documents` (+ download, regenerate), `/admin/payments`, `/admin/subscriptions` (+ cancel), `/admin/products`, `/admin/templates` (+ default), `/admin/contact-messages`, `/admin/audit-logs` |

## What the tests check

- **Every `/api` response:** an `X-Request-Id` header. Every error response must use the envelope `{message, code, requestId}` with an `UPPER_SNAKE` code and no stack traces or Prisma text.
- **Status codes and error codes:** these come from the code, not guessed. Lists are checked for pagination meta (`page`, `pageSize`, `totalItems`, `totalPages = ceil(totalItems / pageSize)`) and for filter and sort correctness.
- **Prices:** the quote total equals the catalog prices, the order total equals the quote, and a `totalCents: 1` sent by the client is ignored. A `role: "admin"` sent to register is ignored, and so is an `email` sent with a guest order.
- **Idempotency:** a replay returns `Idempotent-Replayed: true` with the same order; the same key with a different body gives 422 `IDEMPOTENCY_KEY_REUSED`; a missing key gives 400.
- **Order lifecycle:**
  1. `pending_payment` with a document in `awaiting_payment`.
  2. The webhook arrives; the order becomes `paid` with the document queued.
  3. The 3-pack + 2 additional order grants 5 credits with 1 used.
  4. Spending a credit leaves 3.
  5. A duplicate webhook delivery is not fulfilled twice.
- **Access control:**
  - Anonymous requests get 401.
  - A guest gets 403 on customer and admin routes, and a customer gets 403 on admin routes.
  - Forged or invalid tokens get 401.
  - A second customer gets 404 on the first customer's order, document, download, payment and credit.
  - A suspended customer can't log in.
  - Logout makes the refresh cookie unusable.
- **Documents:** lists hide unpaid documents and never include form data. A download is either a URL valid for at most 5 minutes or a 409 `DOCUMENT_NOT_READY`.

## Known limitations

- **Manual email codes:** verification codes and reset tokens arrive only by email, so a fully unattended purchase run isn't possible.
- **One refresh cookie per host:** after a mid-run admin login, `/auth/refresh` refreshes the admin.
- **Access tokens outlive logout:** logout revokes the refresh session, but an already-issued access token stays valid until it expires (15 min). This is by design and documented in the spec.
- **Rate limits:**
  - Register: 10/h per IP; a run registers 2 accounts and sends 2 more register calls.
  - Contact: 5/h per IP; a run sends 3.
  - Codes: 30 s cooldown and 5/h per email.
  - Two or three full runs per hour per IP stay under these limits. Restarting the server doesn't clear them, because they are stored in the database.
- **Rendering:** without `RENDERER_BUNDLE_PATH` and Chromium, renders fail after 3 attempts. Downloads then return 409, which the tests accept.
- **Stripe-dependent requests** (checkout or portal sessions, refunds, the webhook card lookup) need real Stripe test keys. Checkout tests also accept the documented 503 or 409 refusals.
- **Admin mutations are no-ops by design:** for example, setting `isActive: true` on an active product, or making the current default template the default again. Exceptions are the throwaway second customer (suspended, then reactivated) and marking the QA contact message handled. Refunds and subscription cancels need `allowDestructive=true`.

## Documented but not implemented

These appear in the spec or the requested folder layout, but have no endpoint. The collection doesn't invent them.

| Item | Status |
| --- | --- |
| Separate "Create Payment" endpoint | The PaymentIntent is created by `POST /orders` (spec §9.7) |
| Customer refund endpoint | Refunds are admin-only: `POST /admin/orders/{id}/refunds` |
| Standalone entitlements endpoint | Entitlements are returned in `GET /orders/{id}` |
| `GET /me` | Use `GET /auth/me` |
| Notifications API | Not proposed (spec §9.11); emails go through the outbox |
| Audit endpoints outside admin | Only `GET /admin/audit-logs` |
| Drafts and settings APIs | Not proposed (spec §9.11) |
| `POST /uploads/logo` | Phase 2, optional; not built |
| `previewUrl` on document detail | Not returned |
| Turnstile / hCaptcha token on public forms | Not implemented; rate limits and a honeypot only |
| Health under `/api/v1` | Health is at the server root |
| `GET /api/v1/local-files` | Exists in non-production only, as the target of signed download URLs; not a client endpoint, so no request |
