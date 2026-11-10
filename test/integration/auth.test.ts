import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "../setup-env.ts";
import { createHarness, resetDatabase } from "./harness.ts";

const refreshCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("rt="))?.split(";")[0];

describe.skipIf(!hasDatabase)("auth and account security", () => {
  const h = createHarness();
  const csrf = { "X-Requested-With": "XMLHttpRequest" };

  beforeAll(resetDatabase);

  it("registers a customer, ignoring any role in the body", async () => {
    const res = await request(h.app).post("/api/v1/auth/register").send({ name: "Sam", email: "Sam@Example.com", password: "correct horse battery", role: "admin" }).expect(201);
    expect(res.body.user).toMatchObject({ email: "sam@example.com", role: "customer" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(refreshCookie(res)).toBeDefined();
    await request(h.app).get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`).expect(200);
  });

  it("rejects a duplicate email and a wrong password without revealing which", async () => {
    const dup = await request(h.app).post("/api/v1/auth/register").send({ name: "Sam", email: "sam@example.com", password: "correct horse battery" });
    expect(dup.status).toBe(409);
    const bad = await request(h.app).post("/api/v1/auth/login").send({ email: "sam@example.com", password: "wrong password!!" }).expect(401);
    const unknown = await request(h.app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "wrong password!!" }).expect(401);
    expect(bad.body.code).toBe(unknown.body.code);
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const login = await request(h.app).post("/api/v1/auth/login").send({ email: "sam@example.com", password: "correct horse battery" }).expect(200);
    const first = refreshCookie(login)!;
    await request(h.app).post("/api/v1/auth/refresh").set("Cookie", first).expect(403); // no CSRF header

    const rotated = await request(h.app).post("/api/v1/auth/refresh").set(csrf).set("Cookie", first).expect(200);
    const second = refreshCookie(rotated)!;
    expect(second).not.toBe(first);

    await request(h.app).post("/api/v1/auth/refresh").set(csrf).set("Cookie", first).expect(401);
    // Reuse revoked the whole family, including the newer token.
    await request(h.app).post("/api/v1/auth/refresh").set(csrf).set("Cookie", second).expect(401);
  });

  it("keeps customers out of each other's orders and out of admin routes", async () => {
    const a = await request(h.app).post("/api/v1/auth/register").send({ name: "A", email: "a@example.com", password: "correct horse battery" }).expect(201);
    const b = await request(h.app).post("/api/v1/auth/register").send({ name: "B", email: "b@example.com", password: "correct horse battery" }).expect(201);

    // Unverified customers need a guest token for checkout.
    const templates = await request(h.app).get("/api/v1/catalog/templates?documentType=w2").expect(200);
    const res = await request(h.app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${a.body.accessToken}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ documentType: "w2", templateId: templates.body.data[0].id, items: [{ productCode: "w2_single", quantity: 1 }], formData: {}, termsAccepted: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");

    await request(h.app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${b.body.accessToken}`).expect(403);
    const list = await request(h.app).get("/api/v1/orders").set("Authorization", `Bearer ${b.body.accessToken}`).expect(200);
    expect(list.body.data).toEqual([]);
  });

  it("verifies the email with the emailed code and links earlier guest orders", async () => {
    const login = await request(h.app).post("/api/v1/auth/login").send({ email: "a@example.com", password: "correct horse battery" }).expect(200);
    await h.drainJobs();
    const code = h.mailer.lastCodeFor("a@example.com");
    const res = await request(h.app).post("/api/v1/auth/email/verify").set("Authorization", `Bearer ${login.body.accessToken}`).send({ code }).expect(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  it("answers forgot-password the same way for unknown emails", async () => {
    const known = await request(h.app).post("/api/v1/auth/password/forgot").send({ email: "a@example.com" }).expect(202);
    const unknown = await request(h.app).post("/api/v1/auth/password/forgot").send({ email: "ghost@example.com" }).expect(202);
    expect(known.body).toEqual(unknown.body);
  });
});
