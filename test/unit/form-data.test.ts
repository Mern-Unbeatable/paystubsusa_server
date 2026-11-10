import { describe, expect, it } from "vitest";
import { calculatePaystub, validateFormData } from "../../src/modules/documents/index.ts";
import { AppError } from "../../src/shared/http/app-error.ts";
import { paystubForm } from "../fixtures.ts";

describe("calculatePaystub", () => {
  it("computes hourly gross with 1.5× overtime, extras, taxes and deductions", () => {
    const r = calculatePaystub(paystubForm() as never);
    expect(r.regularEarnings).toBe(2240);
    expect(r.overtimeEarnings).toBe(168);
    expect(r.totalGross).toBe(2508);
    expect(r.allDeductions).toBeCloseTo(300.5);
    expect(r.netPay).toBeCloseTo(2207.5);
  });

  it("uses the salary amount and never returns a negative net pay", () => {
    const r = calculatePaystub({ ...paystubForm(), payType: "Salary", salaryAmount: "100", taxes: [{ id: "t", label: "x", amount: "500" }] } as never);
    expect(r.totalGross).toBe(200);
    expect(r.netPay).toBe(0);
  });
});

describe("validateFormData", () => {
  it("accepts a valid paystub and derives display fields from server-side math", async () => {
    const { display } = await validateFormData("paystub", paystubForm());
    expect(display).toMatchObject({ employerName: "Acme Corporation", recipientName: "Jane Doe", amountCents: 220750, fileName: "Paystub-Jane-Doe-2026-10-16.pdf" });
  });

  it("rejects missing fields with formData-prefixed errors", async () => {
    const err = await validateFormData("paystub", { ...paystubForm(), companyName: "", hourlyRate: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    const errors = (err as AppError).errors ?? {};
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(["formData.companyName", "formData.hourlyRate"]));
  });

  it("rejects a logo that is not PNG or JPEG", async () => {
    const err = await validateFormData("paystub", { ...paystubForm(), companyLogo: "data:image/svg+xml;base64,PHN2Zz4=" }).catch((e: unknown) => e);
    expect((err as AppError).status).toBe(422);
  });

  it("rejects a PNG data URL whose bytes are not a PNG", async () => {
    const fake = `data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`;
    const err = await validateFormData("paystub", { ...paystubForm(), companyLogo: fake }).catch((e: unknown) => e);
    expect((err as AppError).status).toBe(422);
  });
});
