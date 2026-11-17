import { describe, expect, it } from "vitest";
import {
  calculatePaystub,
  flattenPaystubSteps,
  normalizePaystubFormData,
  paystubFieldsForRender,
  validateFormData,
} from "../../src/modules/documents/form-data.ts";
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
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(["formData.steps.employer.companyName", "formData.steps.payDetails.hourlyRate"]),
    );
  });

  it("accepts step-based v2 paystub payloads", async () => {
    const { display } = await validateFormData("paystub", {
      schemaVersion: 2,
      steps: {
        employer: {
          companyLogo: "",
          companyName: "Acme Corporation",
          companyAddress: "1 Main St",
          companyCity: "Austin",
          companyState: "TX",
          companyZip: "78701",
          companyEin: "",
          companyPhone: "",
        },
        employee: {
          employeeName: "Jane Doe",
          employeePhone: "",
          employeeAddress: "2 Oak Ave",
          employeeCity: "Austin",
          employeeState: "TX",
          employeeZip: "78702",
          employeeId: "",
          ssnLast4: "",
          exemptions: "0",
          maritalStatus: "",
          employmentType: "Employee",
        },
        payDetails: {
          payPeriodStart: "2026-10-01",
          payPeriodEnd: "2026-10-15",
          payDate: "2026-10-16",
          payFrequency: "Bi-Weekly",
          payType: "Hourly",
          hourlyRate: "28.00",
          regularHours: "80",
          overtimeHours: "4",
          salaryAmount: "",
          additionalEarnings: [{ id: "a1", desc: "Bonus", amount: "100.00" }],
          taxes: [{ id: "t1", label: "Federal", amount: "250.00" }],
          deductions: [{ id: "d1", desc: "401k", amount: "50.50" }],
        },
        directDeposit: { enabled: false },
      },
    });
    expect(display.amountCents).toBe(220750);
  });

  it("requires bank fields when direct deposit is enabled", async () => {
    const err = await validateFormData("paystub", {
      ...paystubForm(),
      directDeposit: { enabled: true, bankName: "", accountHolderName: "", accountNumber: "", routingNumber: "" },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    const errors = (err as AppError).errors ?? {};
    expect(Object.keys(errors).some((k) => k.includes("directDeposit"))).toBe(true);
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

  it("ignores client-submitted calculation when normalizing", () => {
    const normalized = normalizePaystubFormData({
      ...paystubForm(),
      calculation: { netPay: 1 },
    }) as { steps: unknown; calculation?: unknown };
    expect(normalized.calculation).toBeUndefined();
    expect(normalized.steps).toBeTruthy();
  });

  it("flattens v2 steps for PDF render fields including direct deposit", async () => {
    const { data } = await validateFormData("paystub", {
      ...paystubForm(),
      directDeposit: {
        enabled: true,
        bankName: "Chase",
        accountHolderName: "Jane Doe",
        accountNumber: "123456789",
        routingNumber: "021000021",
        checkNumber: "99",
      },
    });
    const stub = data as { steps: Parameters<typeof flattenPaystubSteps>[0] };
    const flat = flattenPaystubSteps(stub.steps);
    expect(flat.companyName).toBe("Acme Corporation");
    expect(flat.directDeposit.enabled).toBe(true);
    expect(flat.directDeposit.routingNumber).toBe("021000021");
    const fromStored = paystubFieldsForRender(stub);
    expect(fromStored.directDeposit.bankName).toBe("Chase");
  });
});
