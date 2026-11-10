# Test data for the Postman collection

All data in the collection is fictional. Emails use the reserved `example.test` domain, and the phone number is in the 555-01xx fiction range.

## Required seed

```bash
cd server
npx prisma migrate deploy
npm run db:seed
```

The seed creates:

| Product code | Price | Notes |
| --- | --- | --- |
| `paystub_single` | $12.99 | 1 paystub |
| `paystub_pack_3` | $24.99 | 3 credits |
| `paystub_additional` | $7.99 each | Add-on to a single or a pack |
| `w2_single`, `nec1099_single`, `direct_deposit_single` | $14.99 | |
| `unlimited_monthly` | $199/month | Stripe price from `STRIPE_UNLIMITED_PRICE_ID` |

- **Templates:** paystub `01`–`10` (`01` is the default), plus one each for W-2, 1099-NEC and Direct Deposit.
- **Admin account:** from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (at least 12 characters). Put the same values in the environment's `adminEmail` / `adminPassword`. Never commit them.

The tests read prices from `GET /catalog/products` (`price_<code>` variables) rather than hard-coding them, so they stay valid if an admin changes a price.

## Generated per run

| Variable | Value |
| --- | --- |
| `customerEmail` / `customerPassword` | `qa.customer.<timestamp>@example.test` / `Qa-<uuid>` |
| `customer2Email` / `customer2Password` | Same pattern; used for cross-user and suspension tests |
| `guestEmail` | `qa.guest.<timestamp>@example.test`, set once and then reused, so Find Your Paystubs finds the guest's order |

To start fresh, clear the environment's current values (or re-import the environment).

## Paystub form data

The fixture used by **Create Order** and **Redeem Paystub Credit** is the same shape the frontend wizard sends (`formData` is validated by `src/modules/documents/form-data.schemas.ts`):

```json
{
  "companyName": "Example Payroll Co",
  "companyAddress": "100 Sample Street",
  "companyCity": "Austin",
  "companyState": "TX",
  "companyZip": "78701",
  "employeeName": "Test Employee",
  "employeeAddress": "200 Example Avenue",
  "employeeCity": "Austin",
  "employeeState": "TX",
  "employeeZip": "78702",
  "payPeriodStart": "2026-10-01",
  "payPeriodEnd": "2026-10-15",
  "payDate": "2026-10-16",
  "payFrequency": "Bi-Weekly",
  "payType": "Hourly",
  "hourlyRate": "28.00",
  "regularHours": "80",
  "overtimeHours": "4",
  "additionalEarnings": [{ "id": "e1", "desc": "Bonus", "amount": "100.00" }],
  "taxes": [{ "id": "t1", "label": "Federal Income Tax", "amount": "250.00" }],
  "deductions": [{ "id": "d1", "desc": "401(k)", "amount": "50.50" }]
}
```

Money values are decimal strings, the same as the form inputs. The server recomputes totals and ignores any computed values sent by the client. Error fields come back prefixed with `formData.`, for example `formData.companyName`.

## Where to find codes (local)

With `MAIL_DRIVER=log`, each email is written to `server/.mail/<id>.txt` (sort by modified time and open the newest):

| Email | Copy into |
| --- | --- |
| Email verification (after register or resend) | `emailVerificationCode` |
| Checkout code (`purpose: checkout`) | `verificationCode` |
| Document access code (`purpose: document_access`) | `docAccessCode` |
| Password reset link (`/reset-password?token=…`) | `resetToken` (the `token` value only) |

Codes expire after 10 minutes, are single-use, and lock after 5 wrong attempts. Sending a new code invalidates the previous one.

## Stripe (local)

- Use test-mode keys only (`sk_test_…`).
- `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe` prints the `whsec_…` that the server's `STRIPE_WEBHOOK_SECRET` and the environment's `stripeWebhookSecret` must both use.
- Test card for real confirmations: `pm_card_visa`.
