import type { DocumentType } from "../../generated/prisma/enums.ts";
import { validation } from "../../shared/http/app-error.ts";
import { zodToFieldErrors } from "../../shared/middleware/validate.ts";
import {
  formDataSchemas,
  parseMoney,
  type DirectDepositFormData,
  type Nec1099FormData,
  type PaystubFormData,
  type W2FormData,
} from "./form-data.schemas.ts";
import { normalizeLogo } from "./logo.ts";

/** Port of calculatePaystub in web/src/pages/public/Generator/hooks/usePaystubFormData.js. */
export function calculatePaystub(d: Pick<PaystubFormData, "payType" | "hourlyRate" | "regularHours" | "overtimeHours" | "salaryAmount" | "additionalEarnings" | "taxes" | "deductions">) {
  const sum = (items: { amount: string }[]) => items.reduce((s, i) => s + parseMoney(i.amount), 0);
  let regularEarnings: number;
  let overtimeEarnings = 0;
  let totalGross: number;

  if (d.payType === "Hourly") {
    const rate = parseMoney(d.hourlyRate);
    regularEarnings = rate * parseMoney(d.regularHours);
    overtimeEarnings = rate * 1.5 * parseMoney(d.overtimeHours);
    totalGross = regularEarnings + overtimeEarnings;
  } else {
    totalGross = parseMoney(d.salaryAmount);
    regularEarnings = totalGross;
  }
  totalGross += sum(d.additionalEarnings);

  const totalTaxes = sum(d.taxes);
  const totalDeductions = sum(d.deductions);
  const allDeductions = totalTaxes + totalDeductions;
  return { regularEarnings, overtimeEarnings, totalGross, totalTaxes, totalDeductions, allDeductions, netPay: Math.max(0, totalGross - allDeductions) };
}

/** Same rule as toFileSafe in web/src/pages/public/shared/documentFlow/utils/documentFlow.js. */
const fileSafe = (v: string | number | undefined) =>
  String(v ?? "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
const fileName = (parts: (string | number | undefined)[]) => `${parts.map(fileSafe).filter(Boolean).join("-")}.pdf`;

const cents = (amount: number) => Math.round(amount * 100);

export interface DisplayFields {
  title: string;
  employerName: string;
  recipientName: string;
  amountCents: number;
  fileName: string;
}

export function displayFields(type: DocumentType, data: unknown): DisplayFields {
  switch (type) {
    case "paystub": {
      const d = data as PaystubFormData;
      return {
        title: `Paystub · ${d.payDate}`,
        employerName: d.companyName,
        recipientName: d.employeeName,
        amountCents: cents(calculatePaystub(d).netPay),
        fileName: fileName(["Paystub", d.employeeName, d.payDate]),
      };
    }
    case "w2": {
      const d = data as W2FormData;
      const name = [d.firstName, d.lastName].filter(Boolean).join(" ");
      return {
        title: `Form W-2 · Tax Year ${d.taxYear}`,
        employerName: d.employerName,
        recipientName: name,
        amountCents: cents(parseMoney(d.box1Wages)),
        fileName: fileName(["W-2", d.firstName, d.lastName, d.taxYear]),
      };
    }
    case "nec1099": {
      const d = data as Nec1099FormData;
      return {
        title: `Form 1099-NEC · Tax Year ${d.taxYear}`,
        employerName: d.payerName,
        recipientName: d.recipientName,
        amountCents: cents(parseMoney(d.box1NonemployeeComp)),
        fileName: fileName(["1099-NEC", d.recipientName]),
      };
    }
    case "direct_deposit": {
      const d = data as DirectDepositFormData;
      return {
        title: "Direct Deposit Slip",
        employerName: d.employerName,
        recipientName: d.employeeName,
        amountCents: cents(parseMoney(d.depositAmount)),
        fileName: fileName(["Direct-Deposit", d.employeeName, d.depositDate]),
      };
    }
  }
}

/** Validates untrusted formData for the type (422 on failure) and re-encodes the logo. */
export async function validateFormData(type: DocumentType, input: unknown) {
  const result = formDataSchemas[type].safeParse(input);
  if (!result.success) {
    const errors = zodToFieldErrors(result.error);
    throw validation(Object.fromEntries(Object.entries(errors).map(([k, v]) => [`formData.${k}`, v])));
  }
  const data = result.data as Record<string, unknown>;
  if (type === "paystub" && typeof data["companyLogo"] === "string" && data["companyLogo"]) {
    data["companyLogo"] = await normalizeLogo(data["companyLogo"]);
  }
  return { data, display: displayFields(type, data) };
}
