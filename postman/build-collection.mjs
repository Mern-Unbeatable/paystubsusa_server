// Generates the Postman collection and environments from the route list below.
// Edit this file, then run: node postman/build-collection.mjs (from server/).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---------- script helpers (the strings are Postman sandbox JavaScript) ----------

const lines = (s) => s.trim().split("\n").map((l) => l.replace(/^ {0,6}/, ""));

const status = (code) => `pm.test("status is ${code}", function () { pm.response.to.have.status(${code}); });`;

const error = (code, errorCode) => `
${status(code)}
pm.test("error code is ${errorCode}", function () { pm.expect(pm.response.json().code).to.eql("${errorCode}"); });`;

const pagination = `
pm.test("list envelope with pagination meta", function () {
  const b = pm.response.json();
  pm.expect(b.data).to.be.an("array");
  pm.expect(b.meta).to.include.all.keys("page", "pageSize", "totalItems", "totalPages");
  pm.expect(b.meta.page).to.eql(Number(pm.request.url.query.get("page") || 1));
  pm.expect(b.data.length).to.be.at.most(b.meta.pageSize);
  pm.expect(b.meta.totalPages).to.eql(Math.ceil(b.meta.totalItems / b.meta.pageSize));
});`;

const noFormData = `
pm.test("no decrypted form data in the response", function () {
  const text = pm.response.text();
  ["companyAddress", "employeeAddress", "formData", "ssn"].forEach(function (k) { pm.expect(text).to.not.include(k); });
});`;

/** Pre-request guards. `needs` = variables that must be set; `when` = extra JS condition with a reason. */
function guard({ needs = [], when, reason, destructive, localOnly }) {
  const checks = [];
  if (needs.length) {
    checks.push(`const missing = ${JSON.stringify(needs)}.filter(function (v) { return !pm.variables.get(v); });`);
    checks.push(`if (missing.length) skipReason = "set " + missing.join(", ") + " first";`);
  }
  if (when) checks.push(`if (!skipReason && !(${when})) skipReason = ${JSON.stringify(reason)};`);
  if (destructive) checks.push(`if (!skipReason && pm.variables.get("allowDestructive") !== "true") skipReason = "destructive request; set allowDestructive=true to run it";`);
  if (localOnly) checks.push(`if (!skipReason && !/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(pm.variables.replaceIn("{{baseUrl}}"))) skipReason = "local-only request (baseUrl is not localhost)";`);
  return `
let skipReason = "";
${checks.join("\n")}
if (skipReason) { console.warn("Skipped \\"" + pm.info.requestName + "\\": " + skipReason); pm.execution.skipRequest(); }`;
}

/** Builds and signs a Stripe `payment_intent.succeeded` event (local testing only). */
const signWebhook = (orderVar, piVar, totalVar) => `
if (!skipReason) {
  const amount = Number(pm.variables.get("${totalVar}"));
  const payload = JSON.stringify({
    id: "evt_postman_" + Date.now(), object: "event", type: "payment_intent.succeeded",
    api_version: "2026-10-28.endive", created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: pm.variables.get("${piVar}"), object: "payment_intent", amount: amount, amount_received: amount,
      currency: "usd", metadata: { orderId: pm.variables.get("${orderVar}") }, last_payment_error: null } }
  });
  pm.environment.set("webhookPayload", payload);
  const t = Math.floor(Date.now() / 1000);
  const sig = CryptoJS.HmacSHA256(t + "." + payload, pm.variables.get("stripeWebhookSecret")).toString(CryptoJS.enc.Hex);
  pm.environment.set("webhookSignature", "t=" + t + ",v1=" + sig);
}`;

const resign = `
if (!skipReason) {
  const t = Math.floor(Date.now() / 1000);
  const sig = CryptoJS.HmacSHA256(t + "." + pm.variables.get("webhookPayload"), pm.variables.get("stripeWebhookSecret")).toString(CryptoJS.enc.Hex);
  pm.environment.set("webhookSignature", "t=" + t + ",v1=" + sig);
}`;

const newKey = (v) => `if (!skipReason) pm.environment.set("${v}", pm.variables.replaceIn("{{$guid}}"));`;

// ---------- request builder ----------

const AUTH = {
  none: { type: "noauth" },
  customer: { type: "bearer", bearer: [{ key: "token", value: "{{customerToken}}", type: "string" }] },
  customer2: { type: "bearer", bearer: [{ key: "token", value: "{{customer2Token}}", type: "string" }] },
  admin: { type: "bearer", bearer: [{ key: "token", value: "{{adminToken}}", type: "string" }] },
};

const ACCESS_LABEL = { none: "Public", customer: "Customer (Bearer)", customer2: "Second customer (Bearer)", admin: "Admin (Bearer)", guest: "Guest token (`Authorization: Guest <token>`)" };

function req(name, method, urlPath, o = {}) {
  const root = o.root === true;
  const [pathPart, queryPart] = urlPath.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const query = (queryPart ? queryPart.split("&") : []).map((kv) => {
    const [key, value = ""] = kv.split("=");
    return { key, value };
  });
  const url = {
    raw: `{{baseUrl}}${root ? "" : "/api/{{apiVersion}}"}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`,
    host: ["{{baseUrl}}"],
    path: root ? segments : ["api", "{{apiVersion}}", ...segments],
    ...(query.length ? { query } : {}),
  };

  const header = [];
  if (o.auth === "guest") header.push({ key: "Authorization", value: "Guest {{guestToken}}" });
  for (const [key, value] of Object.entries(o.headers ?? {})) header.push({ key, value });
  let body;
  if (o.body !== undefined || o.raw !== undefined) {
    header.push({ key: "Content-Type", value: "application/json" });
    body = { mode: "raw", raw: o.raw ?? JSON.stringify(o.body, null, 2), options: { raw: { language: "json" } } };
  }

  const request = {
    method,
    header,
    url,
    ...(body ? { body } : {}),
    // Undefined auth inherits from the folder (Admin folder sets the admin token).
    ...(o.auth === undefined ? {} : { auth: o.auth === "guest" ? AUTH.none : AUTH[o.auth] }),
    description: [
      o.desc ?? "",
      o.auth !== undefined ? `\n\n**Access:** ${ACCESS_LABEL[o.auth]}` : "",
      o.source ? `\n\n**Implemented in:** \`${o.source}\`` : "",
    ].join("").trim(),
  };

  const event = [];
  if (o.pre) event.push({ listen: "prerequest", script: { type: "text/javascript", exec: lines(o.pre) } });
  if (o.test) event.push({ listen: "test", script: { type: "text/javascript", exec: lines(o.test) } });

  const response = (o.examples ?? []).map((ex) => ({
    name: ex.name,
    originalRequest: { method, header, url, ...(body ? { body } : {}) },
    status: ex.statusText,
    code: ex.code,
    _postman_previewlanguage: "json",
    header: [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
    body: JSON.stringify(ex.body, null, 2),
  }));

  return { name, event, request, response };
}

const folder = (name, description, item, extra = {}) => ({ name, description, item, ...extra });

const errorExample = (code, statusText, errorCode, message, extra = {}) => ({
  name: `${code} ${errorCode}`,
  code,
  statusText,
  body: { message, code: errorCode, ...extra, requestId: "req_7f9c2b1e-0000-4000-8000-000000000000" },
});

// ---------- fixtures (fictional) ----------

const paystubForm = {
  companyName: "Example Payroll Co",
  companyAddress: "100 Sample Street",
  companyCity: "Austin",
  companyState: "TX",
  companyZip: "78701",
  employeeName: "Test Employee",
  employeeAddress: "200 Example Avenue",
  employeeCity: "Austin",
  employeeState: "TX",
  employeeZip: "78702",
  payPeriodStart: "2026-10-01",
  payPeriodEnd: "2026-10-15",
  payDate: "2026-10-16",
  payFrequency: "Bi-Weekly",
  payType: "Hourly",
  hourlyRate: "28.00",
  regularHours: "80",
  overtimeHours: "4",
  additionalEarnings: [{ id: "e1", desc: "Bonus", amount: "100.00" }],
  taxes: [{ id: "t1", label: "Federal Income Tax", amount: "250.00" }],
  deductions: [{ id: "d1", desc: "401(k)", amount: "50.50" }],
};

const packOrderItems = [{ productCode: "paystub_pack_3", quantity: 1 }, { productCode: "paystub_additional", quantity: 2 }];

const saveCreatedOrder = (prefix) => `
${status(201)}
const b = pm.response.json();
pm.test("order is pending payment and priced by the server", function () {
  pm.expect(b.data.order.status).to.eql("pending_payment");
  pm.expect(b.data.order.orderNumber).to.match(/^PS-\\d{4}-\\d{6}$/);
  pm.expect(b.data.order.currency).to.eql("usd");
  pm.expect(b.data.order.totalCents).to.eql(Number(pm.variables.get("${prefix}ExpectedTotalCents")));
});
pm.test("one document awaiting payment", function () {
  pm.expect(b.data.order.documents).to.have.lengthOf(1);
  pm.expect(b.data.order.documents[0].status).to.eql("awaiting_payment");
  pm.expect(b.data.order.documents[0].documentNumber).to.match(/^DOC-\\d{4}-\\d{6}$/);
});
pm.test("Stripe client secret returned", function () {
  pm.expect(b.data.payment.provider).to.eql("stripe");
  pm.expect(b.data.payment.clientSecret).to.include("_secret_");
});
pm.environment.set("${prefix}Id", b.data.order.id);
pm.environment.set("${prefix}TotalCents", String(b.data.order.totalCents));
pm.environment.set("${prefix === "order" ? "paymentIntentId" : "guestPaymentIntentId"}", b.data.payment.clientSecret.split("_secret_")[0]);`;

const verifyPaid = (prefix, docVar, expectedCredits) => `
${status(200)}
const o = pm.response.json().data;
pm.test("order is paid", function () { pm.expect(o.status).to.eql("paid"); pm.expect(o.paidAt).to.be.a("string"); });
pm.test("document left awaiting_payment", function () { pm.expect(o.documents[0].status).to.be.oneOf(["queued", "rendering", "ready", "failed"]); });
${expectedCredits ? `pm.test("credits granted: ${expectedCredits} total, 1 used", function () {
  pm.expect(o.entitlements).to.have.lengthOf(1);
  pm.expect(o.entitlements[0].creditsTotal).to.eql(${expectedCredits});
  pm.expect(o.entitlements[0].creditsUsed).to.eql(1);
  pm.expect(o.entitlements[0].creditsRemaining).to.eql(${expectedCredits - 1});
});
pm.environment.set("entitlementId", o.entitlements[0].id);` : ""}
pm.environment.set("${docVar}", o.documents[0].id);`;

const downloadTest = `
pm.test("200 with a short-lived URL, or 409 while rendering", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 409]);
  const b = pm.response.json();
  if (pm.response.code === 200) {
    pm.expect(b.data.url).to.match(/^https?:\\/\\//);
    const ttl = new Date(b.data.expiresAt).getTime() - Date.now();
    pm.expect(ttl).to.be.within(0, 5 * 60 * 1000 + 5000);
  } else {
    pm.expect(b.code).to.eql("DOCUMENT_NOT_READY");
  }
});`;

const webhookRequest = (name, orderVar, piVar, totalVar) =>
  req(name, "POST", "/webhooks/stripe", {
    auth: "none",
    headers: { "Stripe-Signature": "{{webhookSignature}}" },
    raw: "{{webhookPayload}}",
    desc: "**LOCAL TESTING ONLY.** Builds a `payment_intent.succeeded` event and signs it with `stripeWebhookSecret` (the `whsec_…` your local server uses, e.g. from `stripe listen`). This stands in for Stripe calling the webhook after a successful card payment. The server still verifies the signature, deduplicates by event id, checks the amount against the order total and fulfills the order. Skips itself unless `baseUrl` is localhost and `stripeWebhookSecret` is set. The server also calls Stripe to read the card details, so the local server needs real Stripe **test** keys. For a real end-to-end payment, confirm the PaymentIntent with the Stripe CLI instead (see the README).",
    source: "src/modules/payments/webhook.service.ts",
    pre: guard({ needs: ["stripeWebhookSecret", orderVar, piVar, totalVar], localOnly: true }) + signWebhook(orderVar, piVar, totalVar),
    test: `
${status(200)}
pm.test("event processed (not a duplicate)", function () { pm.expect(pm.response.json()).to.eql({ received: true, duplicate: false }); });`,
  });

// ---------- folders ----------

const health = folder("Health", "Liveness and readiness probes. Mounted at the server root, **not** under `/api/v1`.", [
  req("Liveness", "GET", "/healthz", {
    root: true,
    auth: "none",
    source: "src/modules/public/public.routes.ts",
    test: `${status(200)}\npm.test("status ok", function () { pm.expect(pm.response.json()).to.eql({ status: "ok" }); });`,
    examples: [{ name: "200 OK", code: 200, statusText: "OK", body: { status: "ok" } }],
  }),
  req("Readiness (database)", "GET", "/readyz", {
    root: true,
    auth: "none",
    desc: "200 `{status:\"ready\"}` when the database is reachable, otherwise 503 `{status:\"unavailable\"}`.",
    source: "src/modules/public/public.routes.ts",
    test: `${status(200)}\npm.test("database reachable", function () { pm.expect(pm.response.json()).to.eql({ status: "ready" }); });`,
    examples: [
      { name: "200 Ready", code: 200, statusText: "OK", body: { status: "ready" } },
      { name: "503 Unavailable", code: 503, statusText: "Service Unavailable", body: { status: "unavailable" } },
    ],
  }),
]);

const registerPre = (prefix) => `
pm.environment.set("${prefix}Email", "qa." + "${prefix}".toLowerCase() + "." + Date.now() + "@example.test");
pm.environment.set("${prefix}Password", "Qa-" + pm.variables.replaceIn("{{$guid}}"));`;

const auth = folder(
  "Auth",
  "Cookie + bearer authentication. Login and register return `{user, accessToken}` and set the `rt` refresh cookie (HttpOnly, SameSite=Lax, Path=/api/v1/auth). Postman stores it in its cookie jar and sends it to `/auth/refresh` and `/auth/logout` automatically; scripts never read it. Those two routes also need `X-Requested-With` (CSRF guard for non-browser clients). The jar holds one `rt` per host, so the most recent login owns it.",
  [
    folder("Register", "", [
      req("Register Customer", "POST", "/auth/register", {
        auth: "none",
        source: "src/modules/auth/auth.routes.ts",
        desc: "Creates a customer with a fresh random email and password (stored in the environment). The body also sends `role: \"admin\"` to prove the server ignores it.",
        pre: registerPre("customer"),
        body: { name: "QA Customer", email: "{{customerEmail}}", password: "{{customerPassword}}", role: "admin" },
        test: `
${status(201)}
const b = pm.response.code === 201 ? pm.response.json() : { user: {} };
pm.test("customer role regardless of the body", function () { pm.expect(b.user.role).to.eql("customer"); });
pm.test("user shape", function () {
  pm.expect(b.user).to.include.all.keys("id", "name", "email", "role", "emailVerified", "phone", "createdAt");
  pm.expect(b.user).to.not.have.property("passwordHash");
  pm.expect(b.user.email).to.eql(pm.variables.get("customerEmail"));
  pm.expect(b.user.emailVerified).to.eql(false);
  pm.expect(b.accessToken).to.be.a("string");
});
pm.test("HttpOnly refresh cookie scoped to /api/v1/auth", function () {
  const c = pm.response.headers.all().filter(function (h) { return h.key.toLowerCase() === "set-cookie"; }).map(function (h) { return h.value; }).join("\\n");
  pm.expect(c).to.include("rt=");
  pm.expect(c).to.include("HttpOnly");
  pm.expect(c).to.include("Path=/api/v1/auth");
});
pm.environment.set("customerToken", b.accessToken);
pm.environment.set("customerId", b.user.id);
pm.environment.set("customerEmailVerified", String(b.user.emailVerified));`,
        examples: [
          {
            name: "201 Created",
            code: 201,
            statusText: "Created",
            body: { user: { id: "0192f1a0-0000-7000-8000-000000000001", name: "QA Customer", email: "qa.customer@example.test", role: "customer", emailVerified: false, phone: null, createdAt: "2026-11-09T06:00:00.000Z" }, accessToken: "<access token>" },
          },
          errorExample(409, "Conflict", "EMAIL_TAKEN", "An account with this email already exists"),
        ],
      }),
      req("Register - Duplicate Email", "POST", "/auth/register", {
        auth: "none",
        body: { name: "QA Customer", email: "{{customerEmail}}", password: "{{customerPassword}}" },
        pre: guard({ needs: ["customerEmail"] }),
        test: error(409, "EMAIL_TAKEN"),
      }),
      req("Register - Validation Error", "POST", "/auth/register", {
        auth: "none",
        body: { name: "", email: "not-an-email", password: "short" },
        test: `${error(422, "VALIDATION_ERROR")}
pm.test("field errors for name, email and password", function () {
  pm.expect(pm.response.json().errors).to.include.all.keys("name", "email", "password");
});`,
        examples: [errorExample(422, "Unprocessable Entity", "VALIDATION_ERROR", "Some submitted data is invalid", { errors: { email: ["Enter a valid email address"], password: ["Password must be at least 8 characters"] } })],
      }),
    ]),
    folder("Login", "", [
      req("Login - Invalid Credentials", "POST", "/auth/login", {
        auth: "none",
        body: { email: "{{customerEmail}}", password: "definitely-wrong-password" },
        source: "src/modules/auth/auth.service.ts",
        test: error(401, "INVALID_CREDENTIALS"),
        examples: [errorExample(401, "Unauthorized", "INVALID_CREDENTIALS", "Incorrect email or password")],
      }),
      req("Login Admin", "POST", "/auth/login", {
        auth: "none",
        desc: "Uses `adminEmail` / `adminPassword` (the account created by `npm run db:seed` from `SEED_ADMIN_*`). Skips when they are empty. Run it before the customer login so the cookie jar ends with the customer's refresh cookie.",
        pre: guard({ needs: ["adminEmail", "adminPassword"] }),
        body: { email: "{{adminEmail}}", password: "{{adminPassword}}" },
        test: `
${status(200)}
const b = pm.response.json();
pm.test("admin role", function () { pm.expect(b.user.role).to.eql("admin"); });
pm.environment.set("adminToken", b.accessToken);
pm.environment.set("adminId", b.user.id);`,
      }),
      req("Login Customer", "POST", "/auth/login", {
        auth: "none",
        pre: guard({ needs: ["customerEmail", "customerPassword"] }),
        body: { email: "{{customerEmail}}", password: "{{customerPassword}}", rememberMe: true },
        test: `
${status(200)}
const b = pm.response.json();
pm.test("same user as registered", function () { pm.expect(b.user.id).to.eql(pm.variables.get("customerId")); });
pm.test("rememberMe gives a persistent cookie", function () {
  const c = pm.response.headers.all().filter(function (h) { return h.key.toLowerCase() === "set-cookie"; }).map(function (h) { return h.value; }).join("\\n");
  pm.expect(c).to.match(/rt=[^;]+;.*(Max-Age|Expires)=/i);
});
pm.environment.set("customerToken", b.accessToken);`,
      }),
    ]),
    folder("Refresh Session", "", [
      req("Refresh Session", "POST", "/auth/refresh", {
        auth: "none",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        desc: "No body and no Authorization header: the `rt` cookie from the jar identifies the session. Rotates the refresh token (a new `rt` cookie is set).",
        source: "src/modules/auth/session.service.ts",
        test: `
${status(200)}
const b = pm.response.json();
pm.test("new access token for the customer", function () {
  const claims = JSON.parse(atob(b.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  pm.expect(claims.sub).to.eql(pm.variables.get("customerId"));
  pm.expect(claims.aud).to.eql("api");
});
pm.test("refresh cookie rotated", function () { pm.response.to.have.header("Set-Cookie"); });
pm.environment.set("customerToken", b.accessToken);`,
        examples: [{ name: "200 OK", code: 200, statusText: "OK", body: { accessToken: "<access token>" } }],
      }),
      req("Refresh - Missing CSRF Header", "POST", "/auth/refresh", {
        auth: "none",
        desc: "Without `X-Requested-With` (and without an allowed `Origin`) the CSRF guard rejects the request.",
        source: "src/shared/middleware/origin-check.ts",
        test: error(403, "ORIGIN_NOT_ALLOWED"),
      }),
    ]),
    folder("Logout", "Self-contained: logs in, logs out, proves the refresh session is revoked, then logs in again so later folders keep working. Access tokens are stateless JWTs, so one stays valid until it expires (15 min); logout revokes the refresh session.", [
      req("Login Customer (for logout test)", "POST", "/auth/login", {
        auth: "none",
        pre: guard({ needs: ["customerEmail", "customerPassword"] }),
        body: { email: "{{customerEmail}}", password: "{{customerPassword}}" },
        test: status(200),
      }),
      req("Logout", "POST", "/auth/logout", {
        auth: "none",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        source: "src/modules/auth/auth.controller.ts",
        test: `
${status(204)}
pm.test("refresh cookie cleared", function () {
  const c = pm.response.headers.all().filter(function (h) { return h.key.toLowerCase() === "set-cookie"; }).map(function (h) { return h.value; }).join("\\n");
  pm.expect(c).to.match(/rt=;.*Expires=Thu, 01 Jan 1970/i);
});`,
      }),
      req("Refresh After Logout", "POST", "/auth/refresh", {
        auth: "none",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        test: `
${status(401)}
pm.test("session is gone", function () { pm.expect(pm.response.json().code).to.be.oneOf(["REFRESH_MISSING", "REFRESH_INVALID"]); });`,
      }),
      req("Login Customer (restore session)", "POST", "/auth/login", {
        auth: "none",
        pre: guard({ needs: ["customerEmail", "customerPassword"] }),
        body: { email: "{{customerEmail}}", password: "{{customerPassword}}" },
        test: `${status(200)}\npm.environment.set("customerToken", pm.response.json().accessToken);`,
      }),
    ]),
    folder("Forgot Password", "", [
      req("Forgot Password", "POST", "/auth/password/forgot", {
        auth: "none",
        body: { email: "{{customerEmail}}" },
        desc: "Always 202, whether or not the email exists. A reset link (`/reset-password?token=<challengeId>.<secret>`) is emailed; locally it is written to `server/.mail/`.",
        test: `
${status(202)}
pm.test("accepted", function () { pm.expect(pm.response.json()).to.eql({ data: { accepted: true } }); });
pm.environment.set("forgotPasswordResponse", pm.response.text());`,
      }),
      req("Forgot Password - Unknown Email (same response)", "POST", "/auth/password/forgot", {
        auth: "none",
        body: { email: "nobody.{{$timestamp}}@example.test" },
        test: `
${status(202)}
pm.test("indistinguishable from a known email", function () { pm.expect(pm.response.text()).to.eql(pm.variables.get("forgotPasswordResponse")); });`,
      }),
    ]),
    folder("Reset Password", "", [
      req("Reset Password - Invalid Token", "POST", "/auth/password/reset", {
        auth: "none",
        body: { token: "not-a-real-token.value", password: "{{customerPassword}}" },
        test: error(422, "RESET_TOKEN_INVALID"),
      }),
      req("Reset Password", "POST", "/auth/password/reset", {
        auth: "none",
        desc: "**Manual step:** copy the `token` query value from the reset email into `resetToken`. Resets the password to `customerNewPassword`, revokes all sessions, then logs in again.",
        pre: guard({ needs: ["resetToken"] }) + `\nif (!skipReason) pm.environment.set("customerNewPassword", "Qa-" + pm.variables.replaceIn("{{$guid}}"));`,
        body: { token: "{{resetToken}}", password: "{{customerNewPassword}}" },
        test: `
${status(204)}
pm.environment.set("customerPassword", pm.variables.get("customerNewPassword"));
pm.environment.unset("resetToken");`,
      }),
    ]),
    folder("Email Verification", "Customers must verify their email before checking out with a Bearer token. **Manual step:** the 6-digit code is emailed (locally: newest file in `server/.mail/`); put it in `emailVerificationCode` and run **Verify Email**. Resending invalidates the previous code.", [
      req("Resend Verification Code", "POST", "/auth/email/verification", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"], when: 'pm.variables.get("customerEmailVerified") !== "true"', reason: "email already verified" }),
        test: `
${status(202)}
pm.test("resendAvailableAt in the future", function () { pm.expect(new Date(pm.response.json().data.resendAvailableAt).getTime()).to.be.above(Date.now()); });`,
      }),
      req("Resend Again Immediately (cooldown)", "POST", "/auth/email/verification", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"], when: 'pm.variables.get("customerEmailVerified") !== "true"', reason: "email already verified" }),
        test: `${error(429, "RESEND_COOLDOWN")}\npm.test("Retry-After header", function () { pm.response.to.have.header("Retry-After"); });`,
      }),
      req("Verify Email - Wrong Code", "POST", "/auth/email/verify", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"], when: 'pm.variables.get("customerEmailVerified") !== "true"', reason: "email already verified" }),
        body: { code: "000000" },
        test: error(422, "CODE_INVALID"),
      }),
      req("Verify Email", "POST", "/auth/email/verify", {
        auth: "customer",
        desc: "Marks the email verified and links earlier guest orders placed with the same email.",
        pre: guard({ needs: ["customerToken", "emailVerificationCode"] }),
        body: { code: "{{emailVerificationCode}}" },
        test: `
${status(200)}
pm.test("emailVerified is true", function () { pm.expect(pm.response.json().user.emailVerified).to.eql(true); });
pm.environment.set("customerEmailVerified", "true");
pm.environment.unset("emailVerificationCode");`,
      }),
    ]),
  ],
);

const accounts = folder("Accounts", "The signed-in user's own account. `GET /auth/me` is served by the auth module; `/me` and `/me/password` by the accounts module.", [
  req("Get Current Account", "GET", "/auth/me", {
    auth: "customer",
    source: "src/modules/auth/auth.routes.ts",
    pre: guard({ needs: ["customerToken"] }),
    test: `
${status(200)}
const u = pm.response.json().user;
pm.test("it is me", function () { pm.expect(u.id).to.eql(pm.variables.get("customerId")); pm.expect(u.role).to.eql("customer"); });
pm.test("no secrets", function () { pm.expect(u).to.not.have.any.keys("passwordHash", "stripeCustomerId"); });
pm.environment.set("customerEmailVerified", String(u.emailVerified));`,
  }),
  req("Get Current Account - No Token", "GET", "/auth/me", { auth: "none", test: error(401, "UNAUTHENTICATED") }),
  req("Update Profile", "PATCH", "/me", {
    auth: "customer",
    source: "src/modules/accounts/accounts.routes.ts",
    pre: guard({ needs: ["customerToken"] }),
    body: { name: "QA Customer Updated", phone: "+15555550100" },
    test: `
${status(200)}
pm.test("profile updated", function () {
  const u = pm.response.json().user;
  pm.expect(u.name).to.eql("QA Customer Updated");
  pm.expect(u.phone).to.eql("+15555550100");
});`,
  }),
  req("Update Profile - Invalid Phone", "PATCH", "/me", {
    auth: "customer",
    pre: guard({ needs: ["customerToken"] }),
    body: { phone: "555-0100" },
    test: `${error(422, "VALIDATION_ERROR")}\npm.test("phone error", function () { pm.expect(pm.response.json().errors).to.have.property("phone"); });`,
  }),
  req("Update Profile - Email Not Editable", "PATCH", "/me", {
    auth: "customer",
    desc: "The body is strict: email changes are a separate flow ([DECISION] 14), so unknown keys are rejected.",
    pre: guard({ needs: ["customerToken"] }),
    body: { email: "someone.else@example.test" },
    test: error(422, "VALIDATION_ERROR"),
  }),
  req("Change Password - Wrong Current Password", "POST", "/me/password", {
    auth: "customer",
    pre: guard({ needs: ["customerToken"] }),
    body: { currentPassword: "wrong-current-password", newPassword: "Another-Valid-Passphrase-1" },
    test: `${error(422, "VALIDATION_ERROR")}\npm.test("currentPassword error", function () { pm.expect(pm.response.json().errors).to.have.property("currentPassword"); });`,
  }),
  req("Change Password", "POST", "/me/password", {
    auth: "customer",
    desc: "Changes to a fresh random password and stores it in `customerPassword`. Keeps the current session and revokes the others.",
    pre: guard({ needs: ["customerToken", "customerPassword"] }) + `\nif (!skipReason) pm.environment.set("customerNewPassword", "Qa-" + pm.variables.replaceIn("{{$guid}}"));`,
    body: { currentPassword: "{{customerPassword}}", newPassword: "{{customerNewPassword}}" },
    test: `${status(204)}\npm.environment.set("customerPassword", pm.variables.get("customerNewPassword"));`,
  }),
  req("Login With New Password", "POST", "/auth/login", {
    auth: "none",
    pre: guard({ needs: ["customerEmail", "customerPassword"] }),
    body: { email: "{{customerEmail}}", password: "{{customerPassword}}" },
    test: `${status(200)}\npm.environment.set("customerToken", pm.response.json().accessToken);`,
  }),
]);

const verification = folder(
  "Verification",
  "Email codes that exchange for a guest token (`POST /verifications`, then `/verifications/{id}/verify`). The happy paths live in **Public → Guest Checkout** and **Public → Find Your Paystubs**; this folder holds validation and abuse checks.",
  [
    req("Send Code - Invalid Email", "POST", "/verifications", {
      auth: "none",
      source: "src/modules/verification/verification.routes.ts",
      body: { email: "not-an-email", purpose: "checkout" },
      test: error(422, "VALIDATION_ERROR"),
    }),
    req("Send Code - Invalid Purpose", "POST", "/verifications", {
      auth: "none",
      body: { email: "qa.purpose@example.test", purpose: "password_reset" },
      test: `${error(422, "VALIDATION_ERROR")}\npm.test("purpose error", function () { pm.expect(pm.response.json().errors).to.have.property("purpose"); });`,
    }),
    req("Send Code (cooldown probe)", "POST", "/verifications", {
      auth: "none",
      pre: `pm.environment.set("cooldownEmail", "qa.cooldown." + Date.now() + "@example.test");`,
      body: { email: "{{cooldownEmail}}", purpose: "checkout" },
      test: `
${status(202)}
pm.test("challenge shape", function () {
  const d = pm.response.json().data;
  pm.expect(d).to.include.all.keys("challengeId", "expiresAt", "resendAvailableAt");
});`,
    }),
    req("Send Code Again Within 30 s", "POST", "/verifications", {
      auth: "none",
      pre: guard({ needs: ["cooldownEmail"] }),
      body: { email: "{{cooldownEmail}}", purpose: "checkout" },
      test: `${error(429, "RESEND_COOLDOWN")}\npm.test("Retry-After header", function () { pm.response.to.have.header("Retry-After"); });`,
    }),
    req("Verify - Unknown Challenge", "POST", "/verifications/{{$guid}}/verify", {
      auth: "none",
      body: { code: "123456" },
      test: error(422, "CODE_INVALID"),
    }),
    req("Verify - Malformed Code", "POST", "/verifications/{{$guid}}/verify", {
      auth: "none",
      body: { code: "12ab" },
      test: `${error(422, "VALIDATION_ERROR")}\npm.test("code error", function () { pm.expect(pm.response.json().errors).to.have.property("code"); });`,
    }),
  ],
);

const catalog = folder("Catalog", "Public prices and templates (cached 60 s). Every price the UI shows should come from here.", [
  folder("Products", "", [
    req("List Products", "GET", "/catalog/products", {
      auth: "none",
      source: "src/modules/catalog/catalog.routes.ts",
      test: `
${status(200)}
const items = pm.response.json().data;
pm.test("seeded products present", function () {
  const codes = items.map(function (p) { return p.code; });
  ["paystub_single", "paystub_pack_3", "paystub_additional", "w2_single", "nec1099_single", "direct_deposit_single", "unlimited_monthly"].forEach(function (c) { pm.expect(codes).to.include(c); });
});
pm.test("product shape and integer cents", function () {
  items.forEach(function (p) {
    pm.expect(p).to.include.all.keys("code", "documentType", "kind", "name", "amountCents", "currency", "interval", "creditQuantity", "badge", "sortOrder");
    pm.expect(Number.isInteger(p.amountCents)).to.eql(true);
    pm.expect(p.currency).to.eql("usd");
  });
});
pm.test("internal fields hidden", function () { items.forEach(function (p) { pm.expect(p).to.not.have.any.keys("id", "stripePriceId", "isActive"); }); });
items.forEach(function (p) { pm.environment.set("price_" + p.code, String(p.amountCents)); });`,
      examples: [{ name: "200 OK", code: 200, statusText: "OK", body: { data: [{ code: "paystub_single", documentType: "paystub", kind: "one_time", name: "1 Paystub", amountCents: 1299, currency: "usd", interval: null, creditQuantity: 1, badge: null, sortOrder: 10 }] } }],
    }),
  ]),
  folder("Templates", "", [
    req("List Paystub Templates", "GET", "/catalog/templates?documentType=paystub", {
      auth: "none",
      test: `
${status(200)}
const items = pm.response.json().data;
pm.test("only paystub templates", function () { items.forEach(function (t) { pm.expect(t.documentType).to.eql("paystub"); }); });
pm.test("exactly one default", function () { pm.expect(items.filter(function (t) { return t.isDefault; })).to.have.lengthOf(1); });
pm.test("template shape", function () { items.forEach(function (t) { pm.expect(t).to.include.all.keys("id", "code", "documentType", "title", "subtitle", "renderer", "variant", "isDefault", "sortOrder"); }); });
pm.environment.set("templateId", items.find(function (t) { return t.isDefault; }).id);`,
    }),
    req("List All Templates", "GET", "/catalog/templates", {
      auth: "none",
      test: `
${status(200)}
pm.test("all four document types", function () {
  const types = pm.response.json().data.map(function (t) { return t.documentType; });
  ["paystub", "w2", "nec1099", "direct_deposit"].forEach(function (d) { pm.expect(types).to.include(d); });
});`,
    }),
    req("List Templates - Invalid Type", "GET", "/catalog/templates?documentType=invoice", { auth: "none", test: error(422, "VALIDATION_ERROR") }),
  ]),
]);

const orders = folder(
  "Orders",
  "Customer orders. Creating an order also creates the Stripe PaymentIntent and returns its `clientSecret`; there is no separate \"create payment\" endpoint. A customer needs a verified email (see **Auth → Email Verification**) or must also send an `X-Guest-Token` for the same email. Paystub credits (entitlements) come back in the order detail and are spent with **Documents → Generate Document**.",
  [
    folder("Quote", "`POST /catalog/quote` (catalog module): server-side price for a basket.", [
      req("Quote 3-Pack + 2 Additional", "POST", "/catalog/quote", {
        auth: "none",
        source: "src/modules/catalog/catalog.service.ts",
        pre: guard({ needs: ["price_paystub_pack_3", "price_paystub_additional"] }),
        body: { items: packOrderItems },
        test: `
${status(200)}
const q = pm.response.json().data;
const expected = Number(pm.variables.get("price_paystub_pack_3")) + 2 * Number(pm.variables.get("price_paystub_additional"));
pm.test("total = pack + 2 × additional, from catalog prices", function () {
  pm.expect(q.totalCents).to.eql(expected);
  pm.expect(q.subtotalCents).to.eql(expected);
  pm.expect(q.taxCents).to.eql(0);
});
pm.test("line math", function () { q.lines.forEach(function (l) { pm.expect(l.amountCents).to.eql(l.unitAmountCents * l.quantity); }); });
pm.environment.set("orderExpectedTotalCents", String(q.totalCents));`,
        examples: [{ name: "200 OK", code: 200, statusText: "OK", body: { data: { lines: [{ productCode: "paystub_pack_3", name: "3 Paystubs", quantity: 1, unitAmountCents: 2499, amountCents: 2499 }, { productCode: "paystub_additional", name: "Additional Paystub", quantity: 2, unitAmountCents: 799, amountCents: 1598 }], subtotalCents: 4097, taxCents: 0, totalCents: 4097, currency: "usd" } } }],
      }),
      req("Quote - Invalid Combination", "POST", "/catalog/quote", {
        auth: "none",
        body: { items: [{ productCode: "paystub_single", quantity: 1 }, { productCode: "paystub_pack_3", quantity: 1 }] },
        test: `${error(422, "VALIDATION_ERROR")}\npm.test("items error", function () { pm.expect(pm.response.json().errors.items[0]).to.include("exactly one"); });`,
      }),
      req("Quote - Add-on Over Limit", "POST", "/catalog/quote", {
        auth: "none",
        body: { items: [{ productCode: "paystub_single", quantity: 1 }, { productCode: "paystub_additional", quantity: 51 }] },
        test: error(422, "VALIDATION_ERROR"),
      }),
    ]),
    folder("Create Order", "Requires `Idempotency-Key` (UUID). The server ignores any price, total, userId or email in the body.", [
      req("Create Order - Unverified Email", "POST", "/orders", {
        auth: "customer",
        desc: "Runs only while the customer's email is unverified: checkout is refused.",
        pre: guard({ needs: ["customerToken", "templateId"], when: 'pm.variables.get("customerEmailVerified") === "false"', reason: "customer email already verified" }) + "\n" + newKey("scratchIdempotencyKey"),
        headers: { "Idempotency-Key": "{{scratchIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: paystubForm, termsAccepted: true },
        test: error(403, "EMAIL_VERIFICATION_REQUIRED"),
      }),
      req("Create Order - Missing Idempotency-Key", "POST", "/orders", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "templateId"] }),
        body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: paystubForm, termsAccepted: true },
        source: "src/shared/middleware/idempotency.ts",
        test: error(400, "IDEMPOTENCY_KEY_REQUIRED"),
      }),
      req("Create Order - Invalid Form Data", "POST", "/orders", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "templateId"], when: 'pm.variables.get("customerEmailVerified") === "true"', reason: "verify the customer email first (Auth → Email Verification)" }) + "\n" + newKey("scratchIdempotencyKey"),
        headers: { "Idempotency-Key": "{{scratchIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: {}, termsAccepted: true },
        test: `${error(422, "VALIDATION_ERROR")}\npm.test("formData-prefixed field errors", function () { pm.expect(pm.response.json().errors).to.include.all.keys("formData.companyName", "formData.employeeName"); });`,
      }),
      req("Create Order - Terms Not Accepted", "POST", "/orders", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "templateId"] }) + "\n" + newKey("scratchIdempotencyKey"),
        headers: { "Idempotency-Key": "{{scratchIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: paystubForm, termsAccepted: false },
        test: `${error(422, "VALIDATION_ERROR")}\npm.test("termsAccepted error", function () { pm.expect(pm.response.json().errors).to.have.property("termsAccepted"); });`,
      }),
      req("Create Order (3-Pack + 2 Additional)", "POST", "/orders", {
        auth: "customer",
        source: "src/modules/orders/orders.service.ts",
        desc: "Sends `totalCents: 1` to prove client prices are ignored. Saves `orderId`, `orderTotalCents` and `paymentIntentId` (taken from the client secret).",
        pre: guard({ needs: ["customerToken", "templateId", "orderExpectedTotalCents"], when: 'pm.variables.get("customerEmailVerified") === "true"', reason: "verify the customer email first (Auth → Email Verification)" }) + "\n" + newKey("orderIdempotencyKey"),
        headers: { "Idempotency-Key": "{{orderIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: packOrderItems, formData: paystubForm, termsAccepted: true, totalCents: 1 },
        test: saveCreatedOrder("order"),
        examples: [
          {
            name: "201 Created",
            code: 201,
            statusText: "Created",
            body: {
              data: {
                order: { id: "0192f1a0-0000-7000-8000-0000000000a1", orderNumber: "PS-2026-000123", status: "pending_payment", email: "qa.customer@example.test", userId: "0192f1a0-0000-7000-8000-000000000001", documentType: "paystub", summary: "3 Paystubs + 2 additional", subtotalCents: 4097, totalCents: 4097, currency: "usd", createdAt: "2026-11-09T06:10:00.000Z", paidAt: null, items: [{ productCode: "paystub_pack_3", name: "3 Paystubs", quantity: 1, unitAmountCents: 2499, amountCents: 2499 }, { productCode: "paystub_additional", name: "Additional Paystub", quantity: 2, unitAmountCents: 799, amountCents: 1598 }], documents: [{ id: "0193…", documentNumber: "DOC-2026-000456", type: "paystub", status: "awaiting_payment" }], entitlements: [] },
                payment: { provider: "stripe", clientSecret: "pi_3Q…_secret_…" },
              },
            },
          },
          errorExample(403, "Forbidden", "EMAIL_VERIFICATION_REQUIRED", "Verify your email before checking out"),
        ],
      }),
      req("Create Order - Replay Same Key", "POST", "/orders", {
        auth: "customer",
        desc: "Same key and identical body: the stored response is replayed and no second order or PaymentIntent is created.",
        pre: guard({ needs: ["customerToken", "orderIdempotencyKey", "orderId"] }),
        headers: { "Idempotency-Key": "{{orderIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: packOrderItems, formData: paystubForm, termsAccepted: true, totalCents: 1 },
        test: `
${status(201)}
pm.test("replayed", function () { pm.expect(pm.response.headers.get("Idempotent-Replayed")).to.eql("true"); });
pm.test("same order", function () { pm.expect(pm.response.json().data.order.id).to.eql(pm.variables.get("orderId")); });`,
      }),
      req("Create Order - Key Reused With Different Body", "POST", "/orders", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "orderIdempotencyKey", "orderId"] }),
        headers: { "Idempotency-Key": "{{orderIdempotencyKey}}" },
        body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: paystubForm, termsAccepted: true },
        test: error(422, "IDEMPOTENCY_KEY_REUSED"),
      }),
    ]),
    folder("Get Orders", "", [
      req("List My Orders", "GET", "/orders?page=1&pageSize=20", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: `
${status(200)}
${pagination}
pm.test("contains the created order (when one exists)", function () {
  const id = pm.variables.get("orderId");
  if (id) pm.expect(pm.response.json().data.map(function (o) { return o.id; })).to.include(id);
});
pm.test("only my orders", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.userId).to.eql(pm.variables.get("customerId")); }); });`,
      }),
      req("List My Orders - Filter by Status", "GET", "/orders?status=pending_payment&page=1&pageSize=5", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: `${status(200)}\n${pagination}\npm.test("all pending_payment", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.status).to.eql("pending_payment"); }); });`,
      }),
      req("List My Orders - Invalid pageSize", "GET", "/orders?pageSize=500", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: error(422, "VALIDATION_ERROR"),
      }),
    ]),
    folder("Get Order Details", "", [
      req("Get Order", "GET", "/orders/{{orderId}}", {
        auth: "customer",
        desc: "The success page polls this until `status` is `paid`.",
        pre: guard({ needs: ["customerToken", "orderId"] }),
        test: `
${status(200)}
const o = pm.response.json().data;
pm.test("identity and totals", function () {
  pm.expect(o.id).to.eql(pm.variables.get("orderId"));
  pm.expect(o.totalCents).to.eql(Number(pm.variables.get("orderTotalCents")));
  pm.expect(o.items.reduce(function (s, i) { return s + i.amountCents; }, 0)).to.eql(o.subtotalCents);
});
pm.test("item prices are catalog snapshots", function () {
  o.items.forEach(function (i) { pm.expect(i.unitAmountCents).to.eql(Number(pm.variables.get("price_" + i.productCode))); });
});
pm.test("documents and entitlements arrays", function () { pm.expect(o.documents).to.be.an("array"); pm.expect(o.entitlements).to.be.an("array"); });`,
      }),
      req("Get Order - Unknown Id", "GET", "/orders/{{$guid}}", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: error(404, "ORDER_NOT_FOUND"),
      }),
      req("Get Order - Malformed Id", "GET", "/orders/not-a-uuid", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: error(422, "VALIDATION_ERROR"),
      }),
    ]),
  ],
);

const payments = folder(
  "Payments",
  "There is no \"create payment\" endpoint: `POST /orders` creates the Stripe PaymentIntent and the browser confirms it with Stripe Elements. Payment state changes only through the Stripe webhook. Refunds are an admin action (**Dashboard → Admin → Orders → Refund Order**).",
  [
    folder("Webhooks", "`POST /webhooks/stripe` takes the raw body and verifies `Stripe-Signature`. It is mounted before the JSON parser and the per-IP limiter, and needs no auth header.", [
      req("Webhook - Missing Signature", "POST", "/webhooks/stripe", {
        auth: "none",
        raw: '{"id":"evt_unsigned","type":"payment_intent.succeeded"}',
        source: "src/modules/payments/payments.routes.ts",
        test: error(400, "WEBHOOK_SIGNATURE_INVALID"),
      }),
      req("Webhook - Invalid Signature", "POST", "/webhooks/stripe", {
        auth: "none",
        headers: { "Stripe-Signature": "t=1700000000,v1=0000000000000000000000000000000000000000000000000000000000000000" },
        raw: '{"id":"evt_forged","type":"payment_intent.succeeded"}',
        test: error(400, "WEBHOOK_SIGNATURE_INVALID"),
        examples: [errorExample(400, "Bad Request", "WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature")],
      }),
      webhookRequest("Simulate payment_intent.succeeded (local)", "orderId", "paymentIntentId", "orderTotalCents"),
      req("Replay Same Event (duplicate delivery)", "POST", "/webhooks/stripe", {
        auth: "none",
        headers: { "Stripe-Signature": "{{webhookSignature}}" },
        raw: "{{webhookPayload}}",
        desc: "Re-sends the same event id with a fresh signature. The server must not fulfill twice.",
        pre: guard({ needs: ["stripeWebhookSecret", "webhookPayload"], localOnly: true }) + resign,
        test: `${status(200)}\npm.test("recognized as a duplicate", function () { pm.expect(pm.response.json()).to.eql({ received: true, duplicate: true }); });`,
      }),
      req("Verify Order Paid", "GET", "/orders/{{orderId}}", {
        auth: "customer",
        desc: "After the webhook the order is paid, the document is queued for rendering, and the 3-pack + 2 additional grants 5 credits with 1 used.",
        pre: guard({ needs: ["customerToken", "orderId", "webhookPayload"] }),
        test: verifyPaid("order", "documentId", 5),
      }),
    ]),
    folder("Payment History", "", [
      req("List My Payments", "GET", "/payments?page=1&pageSize=20", {
        auth: "customer",
        source: "src/modules/payments/payments.service.ts",
        pre: guard({ needs: ["customerToken"] }),
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("row shape (matches PaymentHistoryView)", function () {
  rows.forEach(function (p) { pm.expect(p).to.include.all.keys("id", "orderId", "description", "amountCents", "currency", "status", "cardBrand", "cardLast4", "receiptUrl", "createdAt"); });
});
pm.test("provider ids are not exposed to customers", function () { rows.forEach(function (p) { pm.expect(p).to.not.have.property("providerPaymentId"); }); });
const mine = rows.find(function (p) { return p.orderId === pm.variables.get("orderId"); });
if (mine) pm.environment.set("paymentId", mine.id);`,
      }),
      req("Get Payment", "GET", "/payments/{{paymentId}}", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "paymentId"] }),
        test: `
${status(200)}
const p = pm.response.json().data;
pm.test("payment for my order", function () { pm.expect(p.id).to.eql(pm.variables.get("paymentId")); pm.expect(p.orderId).to.eql(pm.variables.get("orderId")); });
pm.test("amount matches the order", function () { pm.expect(p.amountCents).to.eql(Number(pm.variables.get("orderTotalCents"))); });`,
      }),
    ]),
  ],
);

const documents = folder(
  "Documents",
  "PDFs are generated by the background job after payment (or after spending a credit). Lists only show documents of **paid** orders and never include decrypted form data. Rendering needs Chromium and the renderer bundle (`RENDERER_BUNDLE_PATH`); without them documents end up `failed` and downloads return 409.",
  [
    folder("Generate Document", "`POST /documents` spends one paystub credit from a paid order (implemented in the orders module, `EntitlementsService`).", [
      req("Redeem Paystub Credit", "POST", "/documents", {
        auth: "customer",
        source: "src/modules/orders/entitlements.service.ts",
        pre: guard({ needs: ["customerToken", "entitlementId", "templateId"] }),
        body: { entitlementId: "{{entitlementId}}", templateId: "{{templateId}}", formData: { ...paystubForm, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-01" } },
        test: `
${status(201)}
const d = pm.response.json().data;
pm.test("queued document, one credit spent", function () {
  pm.expect(d.document.status).to.eql("queued");
  pm.expect(d.document.documentNumber).to.match(/^DOC-\\d{4}-\\d{6}$/);
  pm.expect(d.creditsRemaining).to.eql(3);
});
pm.environment.set("redeemedDocumentId", d.document.id);`,
      }),
      req("Redeem - Unknown Entitlement", "POST", "/documents", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "templateId"] }),
        body: { entitlementId: "{{$guid}}", templateId: "{{templateId}}", formData: paystubForm },
        test: error(404, "ENTITLEMENT_NOT_FOUND"),
      }),
    ]),
    folder("Get Documents", "", [
      req("List My Documents", "GET", "/documents?type=paystub&sort=-createdAt&page=1&pageSize=20", {
        auth: "customer",
        source: "src/modules/documents/documents.routes.ts",
        pre: guard({ needs: ["customerToken"] }),
        test: `
${status(200)}
${pagination}
${noFormData}
const rows = pm.response.json().data;
pm.test("only paystubs, newest first", function () {
  rows.forEach(function (d) { pm.expect(d.type).to.eql("paystub"); pm.expect(d.status).to.not.eql("revoked"); });
  for (let i = 1; i < rows.length; i++) pm.expect(new Date(rows[i - 1].createdAt).getTime()).to.be.at.least(new Date(rows[i].createdAt).getTime());
});
pm.test("contains the paid order's document (when one exists)", function () {
  const id = pm.variables.get("documentId");
  if (id) pm.expect(rows.map(function (d) { return d.id; })).to.include(id);
});`,
      }),
      req("Search My Documents", "GET", "/documents?q=Test Employee&page=1&pageSize=20", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: `
${status(200)}
${pagination}
pm.test("every hit matches q in a searchable field", function () {
  const q = "test employee";
  pm.response.json().data.forEach(function (d) {
    const hay = [d.title, d.documentNumber, d.employerName, d.recipientName].join(" ").toLowerCase();
    pm.expect(hay).to.include(q);
  });
});`,
      }),
      req("List Documents - Invalid Sort", "GET", "/documents?sort=-amountCents", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: error(422, "VALIDATION_ERROR"),
      }),
      req("Get Document", "GET", "/documents/{{documentId}}", {
        auth: "customer",
        pre: guard({ needs: ["customerToken", "documentId"] }),
        test: `
${status(200)}
${noFormData}
const d = pm.response.json().data;
pm.test("metadata fields", function () {
  pm.expect(d).to.include.all.keys("id", "documentNumber", "type", "title", "employerName", "recipientName", "amountCents", "status", "createdAt", "orderId", "orderNumber");
  pm.expect(d.orderId).to.eql(pm.variables.get("orderId"));
  pm.expect(d.recipientName).to.eql("Test Employee");
});`,
      }),
    ]),
    folder("Download Document", "", [
      req("Download Document", "POST", "/documents/{{documentId}}/download", {
        auth: "customer",
        desc: "Returns a pre-signed URL valid for 5 minutes (POST because it is audited and counted). 409 `DOCUMENT_NOT_READY` while the PDF is rendering or if rendering failed.",
        source: "src/modules/documents/documents.service.ts",
        pre: guard({ needs: ["customerToken", "documentId"] }),
        test: downloadTest,
        examples: [
          { name: "200 OK", code: 200, statusText: "OK", body: { data: { url: "https://bucket.s3.amazonaws.com/documents/…?X-Amz-Signature=…", expiresAt: "2026-11-09T06:20:00.000Z" } } },
          errorExample(409, "Conflict", "DOCUMENT_NOT_READY", "This document is still being prepared. Try again in a moment."),
        ],
      }),
      req("Download - Unknown Document", "POST", "/documents/{{$guid}}/download", {
        auth: "customer",
        pre: guard({ needs: ["customerToken"] }),
        test: error(404, "DOCUMENT_NOT_FOUND"),
      }),
    ]),
  ],
);

const subscriptions = folder("Subscriptions", "Unlimited plan through Stripe Checkout and the Customer Portal. Responses depend on Stripe configuration (`unlimited_monthly` needs a `stripePriceId`, which the seed reads from `STRIPE_UNLIMITED_PRICE_ID`).", [
  folder("Get Subscription", "", [
    req("Get My Subscription", "GET", "/me/subscription", {
      auth: "customer",
      source: "src/modules/subscriptions/subscriptions.routes.ts",
      pre: guard({ needs: ["customerToken"] }),
      test: `
${status(200)}
pm.test("null or the subscription shape", function () {
  const d = pm.response.json().data;
  if (d !== null) pm.expect(d).to.include.all.keys("planName", "amountCents", "interval", "status", "currentPeriodEnd", "cancelAtPeriodEnd", "cardBrand", "cardLast4");
});`,
    }),
  ]),
  folder("Create Checkout", "", [
    req("Create Checkout Session", "POST", "/me/subscription/checkout-session", {
      auth: "customer",
      desc: "201 `{data:{clientSecret}}` (Stripe Checkout Session for the Payment Element in the app). 409 `SUBSCRIPTION_ACTIVE` if already subscribed; 503 `SUBSCRIPTION_UNAVAILABLE` when the plan has no Stripe price.",
      pre: guard({ needs: ["customerToken"] }),
      test: `
pm.test("checkout client secret, or a documented refusal", function () {
  pm.expect(pm.response.code).to.be.oneOf([201, 409, 503]);
  const b = pm.response.json();
  if (pm.response.code === 201) pm.expect(b.data.clientSecret).to.be.a("string").and.not.empty;
  if (pm.response.code === 409) pm.expect(b.code).to.eql("SUBSCRIPTION_ACTIVE");
  if (pm.response.code === 503) pm.expect(b.code).to.eql("SUBSCRIPTION_UNAVAILABLE");
});`,
    }),
  ]),
  folder("Billing Portal", "", [
    req("Create Portal Session", "POST", "/me/subscription/portal-session", {
      auth: "customer",
      desc: "201 `{data:{url}}`, or 409 `NO_BILLING_ACCOUNT` before the customer has a Stripe customer record (created by the first checkout session).",
      pre: guard({ needs: ["customerToken"] }),
      test: `
pm.test("portal URL or NO_BILLING_ACCOUNT", function () {
  pm.expect(pm.response.code).to.be.oneOf([201, 409]);
  const b = pm.response.json();
  if (pm.response.code === 201) pm.expect(b.data.url).to.match(/^https:\\/\\//);
  else pm.expect(b.code).to.eql("NO_BILLING_ACCOUNT");
});`,
    }),
  ]),
]);

const support = folder("Support", "Public contact form. Rate-limited to 5 per hour per IP (the three requests below count). The admin inbox is under **Dashboard → Admin → Contact Messages**.", [
  folder("Contact Messages", "", [
    req("Submit Contact Message", "POST", "/contact-messages", {
      auth: "none",
      source: "src/modules/support/support.routes.ts",
      body: { name: "QA Tester", email: "qa.contact@example.test", subject: "Postman contact test", message: "Automated contact-form check from the Postman collection." },
      test: `${status(202)}\npm.test("received", function () { pm.expect(pm.response.json()).to.eql({ data: { received: true } }); });`,
    }),
    req("Submit - Honeypot Filled (silently dropped)", "POST", "/contact-messages", {
      auth: "none",
      desc: "Bots that fill the hidden `website` field get the same 202, but nothing is stored or emailed.",
      body: { name: "Bot", email: "bot@example.test", subject: "spam", message: "spam", website: "https://spam.example" },
      test: `${status(202)}\npm.test("same response as a real submission", function () { pm.expect(pm.response.json()).to.eql({ data: { received: true } }); });`,
    }),
    req("Submit - Validation Error", "POST", "/contact-messages", {
      auth: "none",
      body: { name: "", email: "bad", subject: "", message: "" },
      test: `${error(422, "VALIDATION_ERROR")}\npm.test("all fields reported", function () { pm.expect(pm.response.json().errors).to.include.all.keys("name", "email", "subject", "message"); });`,
    }),
  ]),
]);

const notifications = folder("Notifications", "**No HTTP endpoints.** Emails (codes, receipts, contact notifications) go through the `email_deliveries` outbox and the `send-email` job. The spec explicitly does not propose a notifications API (§9.11). Locally, emails are written to `server/.mail/`.", []);

const auditFolder = folder("Audit", "**No standalone endpoints.** Mutations write to `audit_logs`; read them with **Dashboard → Admin → Audit Logs** (`GET /admin/audit-logs`).", []);

const guestCheckout = folder(
  "Guest Checkout",
  "Guest purchase without an account (spec §12.1). **Manual step:** after **Send Checkout Code**, copy the 6-digit code from the email (locally: newest file in `server/.mail/`) into `verificationCode`, then run the rest of this folder.",
  [
    req("Send Checkout Code", "POST", "/verifications", {
      auth: "none",
      source: "src/modules/verification/verification.service.ts",
      pre: `if (!pm.environment.get("guestEmail")) pm.environment.set("guestEmail", "qa.guest." + Date.now() + "@example.test");`,
      body: { email: "{{guestEmail}}", purpose: "checkout" },
      test: `
${status(202)}
const d = pm.response.json().data;
pm.test("challenge issued", function () { pm.expect(d.challengeId).to.match(/^[0-9a-f-]{36}$/); });
pm.environment.set("challengeId", d.challengeId);`,
      examples: [{ name: "202 Accepted", code: 202, statusText: "Accepted", body: { data: { challengeId: "0192f2a0-0000-7000-8000-000000000010", expiresAt: "2026-11-09T06:20:00.000Z", resendAvailableAt: "2026-11-09T06:10:30.000Z" } } }],
    }),
    req("Verify - Wrong Code", "POST", "/verifications/{{challengeId}}/verify", {
      auth: "none",
      desc: "Uses one of the 5 attempts; the response says how many are left.",
      pre: guard({ needs: ["challengeId"], when: 'pm.variables.get("verificationCode") !== "000000"', reason: "verificationCode is 000000" }),
      body: { code: "000000" },
      test: `${error(422, "CODE_INVALID")}\npm.test("attemptsRemaining reported", function () { pm.expect(pm.response.json().attemptsRemaining).to.be.a("number"); });`,
    }),
    req("Verify Checkout Code", "POST", "/verifications/{{challengeId}}/verify", {
      auth: "none",
      pre: guard({ needs: ["challengeId", "verificationCode"] }),
      body: { code: "{{verificationCode}}" },
      test: `
${status(200)}
const d = pm.response.json().data;
pm.test("guest token for the verified email", function () {
  pm.expect(d.email).to.eql(pm.variables.get("guestEmail"));
  pm.expect(d.guestToken).to.be.a("string");
  const claims = JSON.parse(atob(d.guestToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  pm.expect(claims.aud).to.eql("guest");
});
pm.environment.set("guestToken", d.guestToken);
pm.environment.unset("verificationCode");`,
      examples: [{ name: "200 OK", code: 200, statusText: "OK", body: { data: { guestToken: "<guest token>", email: "qa.guest@example.test", expiresAt: "2026-11-09T06:40:00.000Z" } } }],
    }),
    req("Verify - Code Already Used", "POST", "/verifications/{{challengeId}}/verify", {
      auth: "none",
      desc: "Codes are single-use.",
      pre: guard({ needs: ["challengeId", "guestToken"] }),
      body: { code: "000000" },
      test: error(422, "CODE_EXPIRED"),
    }),
    req("Create Guest Order (1 Paystub)", "POST", "/orders", {
      auth: "guest",
      pre: guard({ needs: ["guestToken", "templateId", "price_paystub_single"] }) + "\n" + newKey("guestOrderIdempotencyKey") + '\nif (!skipReason) pm.environment.set("guestOrderExpectedTotalCents", pm.variables.get("price_paystub_single"));',
      headers: { "Idempotency-Key": "{{guestOrderIdempotencyKey}}" },
      body: { documentType: "paystub", templateId: "{{templateId}}", items: [{ productCode: "paystub_single", quantity: 1 }], formData: paystubForm, termsAccepted: true, email: "attacker@example.test" },
      desc: "The order email comes from the guest token; the `email` in the body is ignored.",
      test: saveCreatedOrder("guestOrder") + `\npm.test("email from the token, not the body", function () { pm.expect(b.data.order.email).to.eql(pm.variables.get("guestEmail")); });`,
    }),
    req("Get Guest Order", "GET", "/orders/{{guestOrderId}}", {
      auth: "guest",
      pre: guard({ needs: ["guestToken", "guestOrderId"] }),
      test: `${status(200)}\npm.test("guest owns it", function () { pm.expect(pm.response.json().data.email).to.eql(pm.variables.get("guestEmail")); });`,
    }),
    req("List Guest Orders", "GET", "/orders?page=1&pageSize=20", {
      auth: "guest",
      pre: guard({ needs: ["guestToken"] }),
      test: `${status(200)}\n${pagination}\npm.test("scoped to the token email", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.email).to.eql(pm.variables.get("guestEmail")); }); });`,
    }),
    req("Guest Documents Before Payment", "GET", "/documents?page=1&pageSize=20", {
      auth: "guest",
      pre: guard({ needs: ["guestToken", "guestOrderId"] }),
      test: `${status(200)}\npm.test("unpaid document is not listed", function () { pm.expect(pm.response.json().data.map(function (d) { return d.orderId; })).to.not.include(pm.variables.get("guestOrderId")); });`,
    }),
    webhookRequest("Simulate Guest Payment (local)", "guestOrderId", "guestPaymentIntentId", "guestOrderTotalCents"),
    req("Verify Guest Order Paid", "GET", "/orders/{{guestOrderId}}", {
      auth: "guest",
      pre: guard({ needs: ["guestToken", "guestOrderId", "webhookPayload"] }),
      test: verifyPaid("guestOrder", "guestDocumentId", 0) + `\npm.test("single paystub grants no extra credits", function () { pm.expect(o.entitlements).to.have.lengthOf(0); });`,
    }),
    req("Download as Guest", "POST", "/documents/{{guestDocumentId}}/download", {
      auth: "guest",
      pre: guard({ needs: ["guestToken", "guestDocumentId"] }),
      test: downloadTest,
    }),
  ],
);

const findPaystubs = folder("Find Your Paystubs", "Returning guest finds their documents by email (spec §12.6). **Manual step:** copy the emailed code into `docAccessCode`. The cooldown is 30 s per email, so wait after Guest Checkout before sending.", [
  req("Send Document Access Code", "POST", "/verifications", {
    auth: "none",
    pre: guard({ needs: ["guestEmail"] }),
    body: { email: "{{guestEmail}}", purpose: "document_access" },
    test: `${status(202)}\npm.environment.set("docChallengeId", pm.response.json().data.challengeId);`,
  }),
  req("Verify Document Access Code", "POST", "/verifications/{{docChallengeId}}/verify", {
    auth: "none",
    pre: guard({ needs: ["docChallengeId", "docAccessCode"] }),
    body: { code: "{{docAccessCode}}" },
    test: `
${status(200)}
pm.environment.set("guestToken", pm.response.json().data.guestToken);
pm.environment.unset("docAccessCode");`,
  }),
  req("Search Documents as Guest", "GET", "/documents?q=Test&sort=-createdAt&page=1&pageSize=20", {
    auth: "guest",
    pre: guard({ needs: ["guestToken"] }),
    test: `${status(200)}\n${pagination}\n${noFormData}`,
  }),
  req("Get Document as Guest", "GET", "/documents/{{guestDocumentId}}", {
    auth: "guest",
    pre: guard({ needs: ["guestToken", "guestDocumentId"] }),
    test: `${status(200)}\n${noFormData}\npm.test("guest's document", function () { pm.expect(pm.response.json().data.orderId).to.eql(pm.variables.get("guestOrderId")); });`,
  }),
]);

const publicFolder = folder(
  "Public",
  "End-to-end flows for people without an account. Public products and templates are in **Catalog** (not duplicated here), the contact form in **Support**, and health checks in **Health**.",
  [guestCheckout, findPaystubs],
);

const security = folder(
  "Security & Access Control",
  "Authorization matrix: anonymous, guest, customer and a second customer against protected resources. Ownership failures return **404** (not 403) so other users' ids look nonexistent.",
  [
    req("Anonymous → My Orders", "GET", "/orders", { auth: "none", source: "src/shared/middleware/require-role.ts", test: error(401, "UNAUTHENTICATED") }),
    req("Anonymous → Customer Dashboard", "GET", "/me/dashboard", { auth: "none", test: error(401, "UNAUTHENTICATED") }),
    req("Anonymous → Admin Orders", "GET", "/admin/orders", { auth: "none", test: error(401, "UNAUTHENTICATED") }),
    req("Forged Bearer Token", "GET", "/auth/me", {
      auth: "none",
      headers: { Authorization: "Bearer {{forgedToken}}" },
      source: "src/shared/middleware/authenticate.ts",
      desc: "An invalid or expired token is a 401, never a silent downgrade to anonymous. The forged JWT (admin role, bogus signature) is built at runtime so no token-shaped literal is stored in the collection.",
      pre: `
const b64url = function (o) { return btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\\+/g, "-").replace(/\\//g, "_"); };
pm.variables.set("forgedToken", [b64url({ alg: "EdDSA" }), b64url({ sub: "forged", role: "admin", aud: "api" }), "invalid-signature"].join("."));`,
      test: error(401, "TOKEN_EXPIRED"),
    }),
    req("Invalid Guest Token", "GET", "/documents", {
      auth: "none",
      headers: { Authorization: "Guest not-a-valid-token" },
      test: error(401, "GUEST_TOKEN_INVALID"),
    }),
    req("Unsupported Authorization Scheme", "GET", "/documents", {
      auth: "none",
      headers: { Authorization: "Basic cWE6cWE=" },
      test: error(401, "INVALID_AUTHORIZATION"),
    }),
    req("Guest Token Used as Bearer", "GET", "/auth/me", {
      auth: "none",
      headers: { Authorization: "Bearer {{guestToken}}" },
      desc: "Guest tokens have `aud=guest` and are rejected where an access token is expected.",
      pre: guard({ needs: ["guestToken"] }),
      test: error(401, "TOKEN_EXPIRED"),
    }),
    req("Guest → Customer Dashboard", "GET", "/me/dashboard", { auth: "guest", pre: guard({ needs: ["guestToken"] }), test: error(403, "FORBIDDEN") }),
    req("Guest → Admin Orders", "GET", "/admin/orders", { auth: "guest", pre: guard({ needs: ["guestToken"] }), test: error(403, "FORBIDDEN") }),
    req("Guest → Customer Order", "GET", "/orders/{{orderId}}", {
      auth: "guest",
      desc: "The guest token's email differs from the customer's, so the order is invisible.",
      pre: guard({ needs: ["guestToken", "orderId"] }),
      test: error(404, "ORDER_NOT_FOUND"),
    }),
    req("Customer → Admin Customers", "GET", "/admin/customers", { auth: "customer", pre: guard({ needs: ["customerToken"] }), test: error(403, "FORBIDDEN") }),
    req("Customer → Admin Guest Buyers", "GET", "/admin/guest-buyers", { auth: "customer", pre: guard({ needs: ["customerToken"] }), test: error(403, "FORBIDDEN") }),
    req("Customer → Admin Product Update", "PATCH", "/admin/products/paystub_single", {
      auth: "customer",
      pre: guard({ needs: ["customerToken"] }),
      body: { amountCents: 1 },
      test: error(403, "FORBIDDEN"),
    }),
    req("Register Second Customer", "POST", "/auth/register", {
      auth: "none",
      pre: registerPre("customer2"),
      body: { name: "QA Second Customer", email: "{{customer2Email}}", password: "{{customer2Password}}" },
      test: `
${status(201)}
if (pm.response.code === 201) {
  pm.environment.set("customer2Token", pm.response.json().accessToken);
  pm.environment.set("customer2Id", pm.response.json().user.id);
}`,
    }),
    req("Second Customer → First Customer's Order", "GET", "/orders/{{orderId}}", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token", "orderId"] }),
      test: error(404, "ORDER_NOT_FOUND"),
    }),
    req("Second Customer → First Customer's Document", "GET", "/documents/{{documentId}}", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token", "documentId"] }),
      test: error(404, "DOCUMENT_NOT_FOUND"),
    }),
    req("Second Customer → Download First Customer's Document", "POST", "/documents/{{documentId}}/download", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token", "documentId"] }),
      test: error(404, "DOCUMENT_NOT_FOUND"),
    }),
    req("Second Customer → First Customer's Payment", "GET", "/payments/{{paymentId}}", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token", "paymentId"] }),
      test: error(404, "PAYMENT_NOT_FOUND"),
    }),
    req("Second Customer → Spend First Customer's Credit", "POST", "/documents", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token", "entitlementId", "templateId"] }),
      body: { entitlementId: "{{entitlementId}}", templateId: "{{templateId}}", formData: paystubForm },
      test: error(404, "ENTITLEMENT_NOT_FOUND"),
    }),
    req("Second Customer → Own Orders Are Empty", "GET", "/orders", {
      auth: "customer2",
      pre: guard({ needs: ["customer2Token"] }),
      test: `${status(200)}\npm.test("no foreign orders leak into the list", function () { pm.expect(pm.response.json().data).to.eql([]); });`,
    }),
  ],
);

const customerDash = folder("Customer", "Customer-only pages. My orders, documents and payments are in the **Orders**, **Documents** and **Payments** folders (same endpoints the customer dashboard pages call); only the overview endpoint is dashboard-specific.", [
  folder("Overview", "", [
    req("Get Customer Dashboard", "GET", "/me/dashboard", {
      auth: "customer",
      source: "src/modules/dash/customer/customer-dashboard.routes.ts",
      pre: guard({ needs: ["customerToken"] }),
      test: `
${status(200)}
const d = pm.response.json().data;
pm.test("stats shape", function () {
  pm.expect(d.stats).to.include.all.keys("totalDocuments", "paystubDocuments", "successfulPayments", "subscription");
  pm.expect(d.stats.paystubDocuments).to.be.at.most(d.stats.totalDocuments);
});
pm.test("at most 3 recent items each", function () {
  pm.expect(d.recentDocuments.length).to.be.at.most(3);
  pm.expect(d.recentPayments.length).to.be.at.most(3);
});`,
    }),
  ]),
]);

const adminPre = guard({ needs: ["adminToken"] });

const admin = folder(
  "Admin",
  "All requests use `{{adminToken}}` (set by **Auth → Login → Login Admin**) and skip when it is empty. Mutations re-check the admin role in the database. Requests that change real data skip unless `allowDestructive` is `true`.",
  [
    folder("Dashboard", "", [
      req("Admin Dashboard (12 months)", "GET", "/admin/dashboard?range=12m", {
        source: "src/modules/dash/admin/admin-dashboard.service.ts",
        test: `
${status(200)}
const d = pm.response.json().data;
pm.test("KPIs", function () { pm.expect(d.kpis).to.include.all.keys("totalCustomers", "totalDocuments", "totalOrders", "totalRevenueCents", "activeSubscriptions", "generatedToday"); });
pm.test("12 monthly revenue points", function () { pm.expect(d.revenue).to.have.lengthOf(12); d.revenue.forEach(function (r) { pm.expect(r.month).to.match(/^\\d{4}-\\d{2}$/); }); });
pm.test("breakdown percentages", function () { d.documentBreakdown.forEach(function (r) { pm.expect(r.percent).to.be.within(0, 100); }); });
pm.test("recent orders and activity", function () { pm.expect(d.recentOrders.length).to.be.at.most(5); pm.expect(d.activity.length).to.be.at.most(5); });`,
      }),
      req("Admin Dashboard (6 months)", "GET", "/admin/dashboard?range=6m", {
        test: `${status(200)}\npm.test("6 monthly revenue points", function () { pm.expect(pm.response.json().data.revenue).to.have.lengthOf(6); });`,
      }),
      req("Admin Dashboard - Invalid Range", "GET", "/admin/dashboard?range=24m", { test: error(422, "VALIDATION_ERROR") }),
    ]),
    folder("Customers", "", [
      req("List Customers", "GET", "/admin/customers?q={{customerEmail}}&page=1&pageSize=20", {
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("row shape", function () { rows.forEach(function (c) { pm.expect(c).to.include.all.keys("id", "name", "email", "status", "documentCount", "lifetimeSpendCents", "createdAt", "lastLoginAt"); }); });
pm.test("finds the QA customer (when one exists)", function () { if (pm.variables.get("customerId")) pm.expect(rows.map(function (c) { return c.id; })).to.include(pm.variables.get("customerId")); });`,
      }),
      req("List Customers - By Lifetime Spend", "GET", "/admin/customers?sort=-lifetimeSpend&status=active&page=1&pageSize=10", {
        test: `
${status(200)}
${pagination}
pm.test("sorted by spend, active only", function () {
  const rows = pm.response.json().data;
  rows.forEach(function (c) { pm.expect(c.status).to.eql("active"); });
  for (let i = 1; i < rows.length; i++) pm.expect(rows[i - 1].lifetimeSpendCents).to.be.at.least(rows[i].lifetimeSpendCents);
});`,
      }),
      req("List Guest Buyers", "GET", "/admin/guest-buyers?sort=-totalSpent&page=1&pageSize=20", {
        desc: "Orders placed without an account, grouped by email. `hasAccount` is true when that email registered later; those earlier orders stay unlinked.",
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("row shape", function () { rows.forEach(function (g) { pm.expect(g).to.include.all.keys("email", "orderCount", "paidOrderCount", "totalSpentCents", "firstOrderAt", "lastOrderAt", "hasAccount"); }); });
pm.test("sorted by spend", function () { for (let i = 1; i < rows.length; i++) pm.expect(rows[i - 1].totalSpentCents).to.be.at.least(rows[i].totalSpentCents); });`,
      }),
      req("List Guest Buyers - Invalid Sort", "GET", "/admin/guest-buyers?sort=name", { test: status(400) }),
      req("Get Customer", "GET", "/admin/customers/{{customerId}}", {
        pre: guard({ needs: ["adminToken", "customerId"] }),
        test: `
${status(200)}
const c = pm.response.json().data;
pm.test("customer with orders, documents and subscription", function () {
  pm.expect(c.id).to.eql(pm.variables.get("customerId"));
  pm.expect(c.orders.data).to.be.an("array");
  pm.expect(c.documents.data).to.be.an("array");
  pm.expect(c).to.have.property("subscription");
});`,
      }),
      req("Suspend Second Customer", "PATCH", "/admin/customers/{{customer2Id}}", {
        desc: "Targets the throwaway second customer created in **Security & Access Control**. Suspension revokes their sessions.",
        pre: guard({ needs: ["adminToken", "customer2Id"] }),
        body: { status: "suspended", reason: "Postman QA suspension test" },
        test: `${status(200)}\npm.test("suspended", function () { pm.expect(pm.response.json().data.status).to.eql("suspended"); });`,
      }),
      req("Suspended Customer Cannot Log In", "POST", "/auth/login", {
        auth: "none",
        pre: guard({ needs: ["customer2Email", "customer2Password"] }),
        body: { email: "{{customer2Email}}", password: "{{customer2Password}}" },
        test: error(403, "ACCOUNT_SUSPENDED"),
      }),
      req("Reactivate Second Customer", "PATCH", "/admin/customers/{{customer2Id}}", {
        pre: guard({ needs: ["adminToken", "customer2Id"] }),
        body: { status: "active" },
        test: `${status(200)}\npm.test("active again", function () { pm.expect(pm.response.json().data.status).to.eql("active"); });`,
      }),
      req("Admins Cannot Be Suspended", "PATCH", "/admin/customers/{{adminId}}", {
        pre: guard({ needs: ["adminToken", "adminId"] }),
        body: { status: "suspended" },
        test: error(403, "ADMIN_NOT_MODIFIABLE"),
      }),
    ]),
    folder("Orders", "", [
      req("List Orders", "GET", "/admin/orders?status=paid&page=1&pageSize=20", {
        test: `${status(200)}\n${pagination}\npm.test("all paid", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.status).to.eql("paid"); }); });`,
      }),
      req("Search Orders by Email", "GET", "/admin/orders?q={{customerEmail}}&page=1&pageSize=20", {
        pre: guard({ needs: ["adminToken", "customerEmail"] }),
        test: `${status(200)}\n${pagination}\npm.test("matches the email", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.email).to.include(pm.variables.get("customerEmail")); }); });`,
      }),
      req("List Guest Orders", "GET", "/admin/orders?buyer=guest&page=1&pageSize=20", {
        desc: "Orders placed without an account (`userId` is null). `buyer=customer` returns account-linked orders.",
        test: `${status(200)}\n${pagination}\npm.test("all guest orders", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.userId).to.eql(null); }); });`,
      }),
      req("List Customer Orders", "GET", "/admin/orders?buyer=customer&page=1&pageSize=20", {
        test: `${status(200)}\n${pagination}\npm.test("all linked to an account", function () { pm.response.json().data.forEach(function (o) { pm.expect(o.userId).to.be.a("string"); }); });`,
      }),
      req("List Orders - Invalid Buyer", "GET", "/admin/orders?buyer=admin", { test: status(400) }),
      req("Get Order Detail", "GET", "/admin/orders/{{orderId}}", {
        pre: guard({ needs: ["adminToken", "orderId"] }),
        test: `
${status(200)}
const o = pm.response.json().data;
pm.test("payments, refunds, documents and linked user", function () {
  pm.expect(o.payments).to.be.an("array");
  pm.expect(o.refunds).to.be.an("array");
  pm.expect(o.documents).to.be.an("array");
  pm.expect(o.user.id).to.eql(pm.variables.get("customerId"));
});`,
      }),
      req("Refund - Missing Idempotency-Key", "POST", "/admin/orders/{{orderId}}/refunds", {
        pre: guard({ needs: ["adminToken", "orderId"] }),
        body: { amountCents: 100, reason: "Postman QA" },
        test: error(400, "IDEMPOTENCY_KEY_REQUIRED"),
      }),
      req("Refund Order (partial, $1.00)", "POST", "/admin/orders/{{orderId}}/refunds", {
        desc: "**Destructive** (real Stripe refund). Needs an order paid through Stripe (for example confirmed with the Stripe CLI); simulated local payments have no captured charge, so Stripe rejects the refund. The final state arrives later through `charge.refunded`.",
        pre: guard({ needs: ["adminToken", "orderId"], destructive: true }) + "\n" + newKey("refundIdempotencyKey"),
        headers: { "Idempotency-Key": "{{refundIdempotencyKey}}" },
        body: { amountCents: 100, reason: "Postman QA partial refund" },
        test: `${status(202)}\npm.test("refund requested", function () { const d = pm.response.json().data; pm.expect(d.refundId).to.be.a("string"); pm.expect(d.amountCents).to.eql(100); });`,
      }),
    ]),
    folder("Documents", "", [
      req("List Documents", "GET", "/admin/documents?type=paystub&sort=-createdAt&page=1&pageSize=20", {
        test: `${status(200)}\n${pagination}\n${noFormData}\npm.test("admin rows include the owner email", function () { pm.response.json().data.forEach(function (d) { pm.expect(d).to.have.property("email"); }); });`,
      }),
      req("List Failed Documents", "GET", "/admin/documents?status=failed&page=1&pageSize=20", {
        test: `${status(200)}\n${pagination}\npm.test("all failed", function () { pm.response.json().data.forEach(function (d) { pm.expect(d.status).to.eql("failed"); }); });`,
      }),
      req("Get Document", "GET", "/admin/documents/{{documentId}}", {
        pre: guard({ needs: ["adminToken", "documentId"] }),
        test: `
${status(200)}
${noFormData}
pm.test("admin detail fields", function () { pm.expect(pm.response.json().data).to.include.all.keys("email", "userId", "orderStatus", "templateId", "downloadCount", "renderedAt", "purgedAt"); });`,
      }),
      req("Download Document", "POST", "/admin/documents/{{documentId}}/download", {
        pre: guard({ needs: ["adminToken", "documentId"] }),
        test: downloadTest,
      }),
      req("Regenerate Document", "POST", "/admin/documents/{{documentId}}/regenerate", {
        desc: "Re-queues the render from the stored form data. 409 `DOCUMENT_NOT_REGENERABLE` while rendering or after the form data was purged.",
        pre: guard({ needs: ["adminToken", "documentId"] }),
        test: `
pm.test("re-queued, or a documented refusal", function () {
  pm.expect(pm.response.code).to.be.oneOf([202, 409]);
  if (pm.response.code === 202) pm.expect(pm.response.json().data.status).to.eql("queued");
  else pm.expect(pm.response.json().code).to.eql("DOCUMENT_NOT_REGENERABLE");
});`,
      }),
    ]),
    folder("Payments", "", [
      req("List Payments", "GET", "/admin/payments?status=succeeded&page=1&pageSize=20", {
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("succeeded only, with provider ids", function () { rows.forEach(function (p) { pm.expect(p.status).to.eql("succeeded"); pm.expect(p).to.have.property("providerPaymentId"); }); });`,
      }),
      req("Get Payment", "GET", "/admin/payments/{{paymentId}}", {
        pre: guard({ needs: ["adminToken", "paymentId"] }),
        test: `${status(200)}\npm.test("admin payment detail", function () { pm.expect(pm.response.json().data).to.include.all.keys("provider", "providerPaymentId", "failureCode", "email", "userId"); });`,
      }),
    ]),
    folder("Subscriptions", "", [
      req("List Subscriptions", "GET", "/admin/subscriptions?page=1&pageSize=20", {
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("documentsGenerated on each row", function () { rows.forEach(function (s) { pm.expect(s.documentsGenerated).to.be.a("number"); }); });
if (rows[0]) pm.environment.set("subscriptionId", rows[0].id);`,
      }),
      req("Get Subscription", "GET", "/admin/subscriptions/{{subscriptionId}}", {
        pre: guard({ needs: ["adminToken", "subscriptionId"] }),
        test: `${status(200)}\npm.test("same subscription", function () { pm.expect(pm.response.json().data.id).to.eql(pm.variables.get("subscriptionId")); });`,
      }),
      req("Cancel Subscription at Period End", "POST", "/admin/subscriptions/{{subscriptionId}}/cancel", {
        desc: "**Destructive** (cancels in Stripe).",
        pre: guard({ needs: ["adminToken", "subscriptionId"], destructive: true }),
        body: { atPeriodEnd: true },
        test: `${status(200)}\npm.test("cancel at period end", function () { pm.expect(pm.response.json().data.cancelAtPeriodEnd).to.eql(true); });`,
      }),
    ]),
    folder("Products", "", [
      req("List Products (admin)", "GET", "/admin/products", {
        test: `${status(200)}\npm.test("admin fields", function () { pm.response.json().data.forEach(function (p) { pm.expect(p).to.include.all.keys("code", "amountCents", "isActive", "isAddon", "stripePriceId"); }); });`,
      }),
      req("Update Product (no-op: keep active)", "PATCH", "/admin/products/paystub_single", {
        desc: "Sets `isActive: true` on an active product, so nothing changes but the update path and audit log are exercised. Changing `amountCents` changes live prices; do it by hand.",
        body: { isActive: true },
        test: `${status(200)}\npm.test("still active", function () { pm.expect(pm.response.json().data.isActive).to.eql(true); });`,
      }),
      req("Update Product - Empty Body", "PATCH", "/admin/products/paystub_single", { body: {}, test: error(422, "VALIDATION_ERROR") }),
      req("Update Product - Unknown Code", "PATCH", "/admin/products/does_not_exist", { body: { isActive: true }, test: error(404, "PRODUCT_NOT_FOUND") }),
    ]),
    folder("Templates", "", [
      req("List Templates (admin)", "GET", "/admin/templates?documentType=paystub", {
        test: `
${status(200)}
const rows = pm.response.json().data;
pm.test("isActive exposed", function () { rows.forEach(function (t) { pm.expect(t).to.have.property("isActive"); }); });
const def = rows.find(function (t) { return t.isDefault; });
pm.environment.set("adminTemplateId", def.id);
pm.environment.set("adminTemplateSortOrder", String(def.sortOrder));`,
      }),
      req("Update Template (no-op: same sortOrder)", "PATCH", "/admin/templates/{{adminTemplateId}}", {
        pre: guard({ needs: ["adminToken", "adminTemplateId"] }),
        raw: '{\n  "sortOrder": {{adminTemplateSortOrder}}\n}',
        test: `${status(200)}\npm.test("unchanged sortOrder", function () { pm.expect(pm.response.json().data.sortOrder).to.eql(Number(pm.variables.get("adminTemplateSortOrder"))); });`,
      }),
      req("Deactivate Default Template - Refused", "PATCH", "/admin/templates/{{adminTemplateId}}", {
        desc: "Business rule: a default template can't be deactivated.",
        pre: guard({ needs: ["adminToken", "adminTemplateId"] }),
        body: { isActive: false },
        test: `${error(422, "VALIDATION_ERROR")}\npm.test("isActive error", function () { pm.expect(pm.response.json().errors).to.have.property("isActive"); });`,
      }),
      req("Set Default Template (no-op: current default)", "POST", "/admin/templates/{{adminTemplateId}}/default", {
        pre: guard({ needs: ["adminToken", "adminTemplateId"] }),
        test: `${status(200)}\npm.test("is default", function () { pm.expect(pm.response.json().data.isDefault).to.eql(true); });`,
      }),
      req("Update Template - Unknown Field", "PATCH", "/admin/templates/{{adminTemplateId}}", {
        pre: guard({ needs: ["adminToken", "adminTemplateId"] }),
        body: { renderer: "custom" },
        test: error(422, "VALIDATION_ERROR"),
      }),
    ]),
    folder("Contact Messages", "Support inbox (spec §9.10), shown at /admin/contacts. Filters: `status` (new | handled) and `q` (name, email or subject). Create, status change and delete need a fresh admin role check. Message text can't be edited.", [
      req("List New Contact Messages", "GET", "/admin/contact-messages?status=new&page=1&pageSize=20", {
        test: `
${status(200)}
${pagination}
const rows = pm.response.json().data;
pm.test("all new", function () { rows.forEach(function (m) { pm.expect(m.status).to.eql("new"); }); });
const mine = rows.find(function (m) { return m.subject === "Postman contact test"; });
if (mine) pm.environment.set("contactMessageId", mine.id);`,
      }),
      req("Search Contact Messages", "GET", "/admin/contact-messages?q=Postman&page=1&pageSize=20", {
        test: `
${status(200)}
${pagination}
pm.test("matches name, email or subject", function () {
  pm.response.json().data.forEach(function (m) {
    pm.expect((m.name + " " + m.email + " " + m.subject).toLowerCase()).to.include("postman");
  });
});`,
      }),
      req("Mark Contact Message Handled", "PATCH", "/admin/contact-messages/{{contactMessageId}}", {
        pre: guard({ needs: ["adminToken", "contactMessageId"] }),
        body: { status: "handled" },
        test: `${status(200)}\npm.test("handled", function () { pm.expect(pm.response.json().data.status).to.eql("handled"); });`,
      }),
      req("Create Contact Message (logged by admin)", "POST", "/admin/contact-messages", {
        desc: "Records a message received another way (phone, email). No notification email is sent.",
        body: { name: "QA Phone Caller", email: "qa.phone@example.test", subject: "Postman admin-logged message", message: "Logged by an admin from the Postman collection.", status: "new" },
        test: `${status(201)}\nconst m = pm.response.json().data;\npm.test("created as new", function () { pm.expect(m.status).to.eql("new"); });\npm.environment.set("adminContactMessageId", m.id);`,
      }),
      req("Update Contact Message - Text Fields Rejected", "PATCH", "/admin/contact-messages/{{adminContactMessageId}}", {
        desc: "Only `status` can change; message text is never edited.",
        pre: guard({ needs: ["adminToken", "adminContactMessageId"] }),
        body: { subject: "Edited subject" },
        test: status(400),
      }),
      req("Reply to Contact Message", "POST", "/admin/contact-messages/{{adminContactMessageId}}/reply", {
        desc: "Emails the reply to the sender (template `contact_reply`, Reply-To: support inbox) and marks the message handled. Requires an `Idempotency-Key` header; the audit log stores only the reply length.",
        pre: guard({ needs: ["adminToken", "adminContactMessageId"] }),
        headers: { "Idempotency-Key": "{{$guid}}" },
        body: { message: "Thanks for reaching out. This is a reply from the Postman collection." },
        test: `${status(200)}\npm.test("marked handled", function () { pm.expect(pm.response.json().data.status).to.eql("handled"); });`,
      }),
      req("Reply to Contact Message - Empty Reply", "POST", "/admin/contact-messages/{{adminContactMessageId}}/reply", {
        pre: guard({ needs: ["adminToken", "adminContactMessageId"] }),
        headers: { "Idempotency-Key": "{{$guid}}" },
        body: { message: "   " },
        test: status(400),
      }),
      req("Delete Contact Message", "DELETE", "/admin/contact-messages/{{adminContactMessageId}}", {
        pre: guard({ needs: ["adminToken", "adminContactMessageId"] }),
        test: status(204),
      }),
      req("Delete Contact Message - Already Deleted", "DELETE", "/admin/contact-messages/{{adminContactMessageId}}", {
        pre: guard({ needs: ["adminToken", "adminContactMessageId"] }),
        test: status(404),
      }),
    ]),
    folder("Audit Logs", "", [
      req("List Audit Logs - Admin Actions", "GET", "/admin/audit-logs?action=customer.suspend&page=1&pageSize=20", {
        test: `${status(200)}\n${pagination}\npm.test("filtered by action", function () { pm.response.json().data.forEach(function (a) { pm.expect(a.action).to.eql("customer.suspend"); }); });`,
      }),
      req("List Audit Logs - By Actor", "GET", "/admin/audit-logs?actorId={{adminId}}&page=1&pageSize=20", {
        pre: guard({ needs: ["adminToken", "adminId"] }),
        test: `${status(200)}\n${pagination}\npm.test("all by this admin", function () { pm.response.json().data.forEach(function (a) { pm.expect(a.actorId).to.eql(pm.variables.get("adminId")); }); });`,
      }),
    ]),
  ],
  {
    auth: AUTH.admin,
    event: [{ listen: "prerequest", script: { type: "text/javascript", exec: lines(adminPre) } }],
  },
);

const dashboard = folder("Dashboard", "Customer and admin dashboard APIs, kept separate.", [customerDash, admin]);

// Collection-wide checks that run after every request.
const collectionTests = `
const isApi = pm.request.url.toString().indexOf("/api/") !== -1;
if (isApi) {
  pm.test("[global] X-Request-Id header", function () { pm.response.to.have.header("X-Request-Id"); });
  if (pm.response.code >= 400) {
    pm.test("[global] error envelope { message, code, requestId }", function () {
      const b = pm.response.json();
      pm.expect(b.message).to.be.a("string");
      pm.expect(b.code).to.match(/^[A-Z_]+$/);
      pm.expect(b.requestId).to.be.a("string");
      pm.expect(JSON.stringify(b)).to.not.match(/prisma|stack|at \\w+ \\(/i);
    });
  }
}`;

const collection = {
  info: {
    name: "Paystubs USA - Backend API",
    description:
      "Requests and tests for the Paystubs USA API (`server/`). Base URL `{{baseUrl}}/api/{{apiVersion}}`; health probes at the root. Select an environment before running: scripts store ids and tokens in it. See `server/postman/README.md` for workflows, manual steps (email codes) and limitations. Generated by `postman/build-collection.mjs`; edit that file, not this JSON.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: AUTH.none,
  event: [{ listen: "test", script: { type: "text/javascript", exec: lines(collectionTests) } }],
  item: [health, auth, accounts, verification, catalog, orders, payments, documents, subscriptions, support, notifications, auditFolder, publicFolder, security, dashboard],
};

// ---------- environments ----------

const runtimeVars = [
  "customerEmail", "customerPassword", "customerNewPassword", "customerToken", "customerId", "customerEmailVerified",
  "customer2Email", "customer2Password", "customer2Token", "customer2Id",
  "adminToken", "adminId",
  "guestEmail", "guestToken", "challengeId", "verificationCode", "docChallengeId", "docAccessCode", "cooldownEmail",
  "emailVerificationCode", "resetToken", "forgotPasswordResponse",
  "templateId", "orderExpectedTotalCents", "guestOrderExpectedTotalCents",
  "orderId", "orderIdempotencyKey", "orderTotalCents", "paymentIntentId", "entitlementId", "documentId", "redeemedDocumentId", "paymentId",
  "guestOrderId", "guestOrderIdempotencyKey", "guestOrderTotalCents", "guestPaymentIntentId", "guestDocumentId",
  "scratchIdempotencyKey", "refundIdempotencyKey", "webhookPayload", "webhookSignature",
  "subscriptionId", "contactMessageId", "adminContactMessageId", "adminTemplateId", "adminTemplateSortOrder",
];
const SECRET = new Set(["customerPassword", "customerNewPassword", "customer2Password", "adminPassword", "stripeWebhookSecret", "customerToken", "customer2Token", "adminToken", "guestToken", "resetToken"]);

function environment(name, baseUrl, extra) {
  const values = [
    { key: "baseUrl", value: baseUrl },
    { key: "apiVersion", value: "v1" },
    { key: "allowDestructive", value: "false" },
    { key: "adminEmail", value: "" },
    { key: "adminPassword", value: "" },
    ...extra,
    ...runtimeVars.map((key) => ({ key, value: "" })),
  ].map((v) => ({ ...v, type: SECRET.has(v.key) ? "secret" : "default", enabled: true }));
  return { name, values, _postman_variable_scope: "environment" };
}

const write = (file, data) => writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + "\n");

write("Paystubs-USA-API.postman_collection.json", collection);
write("Paystubs-USA-Local.postman_environment.json", environment("Paystubs USA - Local", "http://localhost:4000", [{ key: "stripeWebhookSecret", value: "" }]));
// Webhook simulation is local-only, so Development has no stripeWebhookSecret.
write("Paystubs-USA-Development.postman_environment.json", environment("Paystubs USA - Development", "https://dev-api.paystubsusa.example", []));

console.log("Wrote collection and environments to", dir);
