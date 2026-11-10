import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "../setup-env.ts";
import { paystubForm } from "../fixtures.ts";
import { createHarness, paymentIntentEvent, resetDatabase } from "./harness.ts";

describe.skipIf(!hasDatabase)("guest purchase → webhook → render → download", () => {
  const h = createHarness();
  const email = "jane@example.com";
  let token: string;
  let templateId: string;
  let orderId: string;
  const key = randomUUID();

  const orderBody = () => ({
    documentType: "paystub",
    templateId,
    items: [{ productCode: "paystub_pack_3", quantity: 1 }, { productCode: "paystub_additional", quantity: 2 }],
    formData: paystubForm(),
    termsAccepted: true,
    // Must be ignored: the server prices from the catalog and takes the email from the token.
    totalCents: 1,
    email: "attacker@example.com",
  });

  beforeAll(async () => {
    await resetDatabase();
    token = await h.guestToken(email);
    const templates = await request(h.app).get("/api/v1/catalog/templates?documentType=paystub").expect(200);
    templateId = templates.body.data[0].id;
  });

  it("creates the order at the server-side price and returns a client secret", async () => {
    const res = await request(h.app).post("/api/v1/orders").set("Authorization", `Guest ${token}`).set("Idempotency-Key", key).send(orderBody()).expect(201);
    const { order, payment } = res.body.data;
    expect(order).toMatchObject({ status: "pending_payment", email, totalCents: 4097, currency: "usd" });
    expect(order.documents).toEqual([expect.objectContaining({ status: "awaiting_payment", type: "paystub" })]);
    expect(payment.clientSecret).toMatch(/_secret_/);
    orderId = order.id;
  });

  it("replays the same response for a repeated Idempotency-Key", async () => {
    const res = await request(h.app).post("/api/v1/orders").set("Authorization", `Guest ${token}`).set("Idempotency-Key", key).send(orderBody()).expect(201);
    expect(res.headers["idempotent-replayed"]).toBe("true");
    expect(res.body.data.order.id).toBe(orderId);
    expect(h.gateway.intents.size).toBe(1);
  });

  it("rejects reuse of the key with a different body", async () => {
    const body = { ...orderBody(), items: [{ productCode: "paystub_single", quantity: 1 }] };
    const res = await request(h.app).post("/api/v1/orders").set("Authorization", `Guest ${token}`).set("Idempotency-Key", key).send(body);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("hides the order from another guest (404, not 403)", async () => {
    const other = await h.guestToken("eve@example.com");
    await request(h.app).get(`/api/v1/orders/${orderId}`).set("Authorization", `Guest ${other}`).expect(404);
    const list = await request(h.app).get("/api/v1/orders").set("Authorization", `Guest ${other}`).expect(200);
    expect(list.body.data).toEqual([]);
  });

  it("does not list or serve documents before payment", async () => {
    const list = await request(h.app).get("/api/v1/documents").set("Authorization", `Guest ${token}`).expect(200);
    expect(list.body.data).toEqual([]);
  });

  it("fulfills on a signed payment_intent.succeeded and ignores the duplicate delivery", async () => {
    const [piId] = [...h.gateway.intents.keys()];
    const event = paymentIntentEvent("payment_intent.succeeded", { id: piId!, orderId, amount: 4097 });
    expect((await h.webhook(event)).body).toMatchObject({ received: true, duplicate: false });
    expect((await h.webhook(event)).body).toMatchObject({ received: true, duplicate: true });

    const res = await request(h.app).get(`/api/v1/orders/${orderId}`).set("Authorization", `Guest ${token}`).expect(200);
    expect(res.body.data.status).toBe("paid");
    expect(res.body.data.documents[0].status).toBe("queued");
    expect(res.body.data.entitlements).toEqual([expect.objectContaining({ creditsTotal: 5, creditsUsed: 1, creditsRemaining: 4 })]);
  });

  it("renders the PDF in the job runner and issues a download URL", async () => {
    await h.drainJobs();
    expect(h.renderer.calls).toHaveLength(1);
    expect(h.mailer.sent.some((m) => m.to === email && m.subject.includes("PS-"))).toBe(true);

    const docs = await request(h.app).get("/api/v1/documents").set("Authorization", `Guest ${token}`).expect(200);
    const doc = docs.body.data[0];
    expect(doc).toMatchObject({ status: "ready", recipientName: "Jane Doe" });
    expect(JSON.stringify(docs.body)).not.toContain("companyAddress");

    const dl = await request(h.app).post(`/api/v1/documents/${doc.id}/download`).set("Authorization", `Guest ${token}`).expect(200);
    const url = new URL(dl.body.data.url);
    const file = await request(h.app).get(`${url.pathname}${url.search}`).expect(200);
    expect(file.headers["content-disposition"]).toContain("Paystub-Jane-Doe-2026-10-16.pdf");
    expect(Buffer.from(file.body).toString()).toContain("%PDF");
  });

  it("spends a credit to create another paystub", async () => {
    const order = await request(h.app).get(`/api/v1/orders/${orderId}`).set("Authorization", `Guest ${token}`).expect(200);
    const entitlementId = order.body.data.entitlements[0].id;
    const res = await request(h.app)
      .post("/api/v1/documents")
      .set("Authorization", `Guest ${token}`)
      .send({ entitlementId, templateId, formData: { ...paystubForm(), payDate: "2026-10-31" } })
      .expect(201);
    expect(res.body.data.creditsRemaining).toBe(3);
    // Not eve: a second code for the same email within 30 s is (correctly) RESEND_COOLDOWN.
    const other = await h.guestToken("mallory@example.com");
    await request(h.app).post("/api/v1/documents").set("Authorization", `Guest ${other}`).send({ entitlementId, templateId, formData: paystubForm() }).expect(404);
  });

  it("marks an order failed when the captured amount does not match", async () => {
    const created = await request(h.app)
      .post("/api/v1/orders")
      .set("Authorization", `Guest ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({ ...orderBody(), items: [{ productCode: "paystub_single", quantity: 1 }] })
      .expect(201);
    const id = created.body.data.order.id;
    const piId = [...h.gateway.intents.entries()].find(([, v]) => v.orderId === id)![0];
    await h.webhook(paymentIntentEvent("payment_intent.succeeded", { id: piId, orderId: id, amount: 1 })).expect(200);
    const res = await request(h.app).get(`/api/v1/orders/${id}`).set("Authorization", `Guest ${token}`).expect(200);
    expect(res.body.data.status).toBe("failed");
  });
});
