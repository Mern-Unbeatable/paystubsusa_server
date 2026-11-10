/** HTTP-level checks that are rejected before any database access. */
import request from "supertest";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { createContainer } from "../../src/container.ts";
import { signAccessToken, signGuestToken } from "../../src/shared/crypto/jwt.ts";

const app = createApp(createContainer());

describe("authorization", () => {
  it("401s admin routes without a token and 403s a customer token", async () => {
    await request(app).get("/api/v1/admin/customers").expect(401);
    const token = await signAccessToken("0192f2a0-0000-7000-8000-000000000001", "customer", "s1");
    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`).expect(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
  });

  it("401s a forged bearer token instead of downgrading to anonymous", async () => {
    const res = await request(app).get("/api/v1/catalog/products").set("Authorization", "Bearer abc.def.ghi").expect(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  it("403s guests on customer-only routes and admin routes", async () => {
    const { token } = await signGuestToken("jane@example.com");
    await request(app).get("/api/v1/me/dashboard").set("Authorization", `Guest ${token}`).expect(403);
    await request(app).get("/api/v1/admin/orders").set("Authorization", `Guest ${token}`).expect(403);
  });

  it("401s anonymous callers on owner-scoped routes", async () => {
    await request(app).get("/api/v1/orders").expect(401);
    await request(app).get("/api/v1/documents").expect(401);
    await request(app).get("/api/v1/payments").expect(401);
  });
});

describe("Stripe webhook", () => {
  it("rejects a missing or invalid signature with 400", async () => {
    await request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").send("{}").expect(400);
    const header = Stripe.webhooks.generateTestHeaderString({ payload: "{}", secret: "whsec_wrong" });
    const res = await request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").set("Stripe-Signature", header).send("{}").expect(400);
    expect(res.body.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });
});

describe("errors", () => {
  it("returns the JSON error envelope for unknown routes and never leaks internals", async () => {
    const res = await request(app).get("/api/v1/nope").expect(404);
    expect(res.body).toMatchObject({ code: "ROUTE_NOT_FOUND", requestId: expect.any(String) });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/api/v1/catalog/quote").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });
});
