import { z } from "zod";

// Mirrors web/src/pages/public/**/hooks/use*FormData.js. Unknown keys (e.g. checkout `email`) are stripped.
// Required fields and identifier formats follow [DECISION] 8; DC is accepted ([DECISION] 23).

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const text = (max = 200) => z.string().trim().max(max);
const required = (label: string, max = 200) => text(max).min(1, `${label} is required`);
const optional = (max = 200) => text(max).optional().default("");
const state = (label: string) => z.enum(US_STATES, { error: `${label} must be a US state` });
const zip = (label: string) => z.string().trim().regex(/^\d{5}(-\d{4})?$/, `${label} must be a 5-digit ZIP code`);

const SSN = /^\d{3}-?\d{2}-?\d{4}$/;
const EIN = /^\d{2}-?\d{7}$/;
const ssn = z.string().trim().regex(SSN, "Enter a valid SSN (XXX-XX-XXXX)");
const ein = z.string().trim().regex(EIN, "Enter a valid EIN (XX-XXXXXXX)");
const tin = z.string().trim().refine((v) => SSN.test(v) || EIN.test(v), "Enter a valid SSN or EIN");
const optionalEin = z.string().trim().refine((v) => v === "" || EIN.test(v), "Enter a valid EIN (XX-XXXXXXX)").optional().default("");

const MONEY = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/;
/** Free-text money such as "65,000.00"; the original string is kept for rendering. */
const money = (label: string) => z.string().trim().regex(MONEY, `${label} must be an amount like 1,250.00`);
const optionalMoney = (label: string) => z.union([z.literal(""), money(label)]).optional().default("");
const hours = (label: string) => z.string().trim().regex(/^\d{1,4}(\.\d{1,2})?$/, `${label} must be a number`);
const isoDate = (label: string) =>
  z.iso.date({ error: `${label} must be a date (YYYY-MM-DD)` });

const taxYear = z
  .number()
  .int()
  .min(2000)
  .max(new Date().getUTCFullYear())
  .default(() => new Date().getUTCFullYear() - 1);

export const parseMoney = (value: string | undefined | null): number => {
  const n = parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const lineAmount = z.union([z.literal(""), money("Amount")]);
const descLine = z.object({ id: z.string().max(64), desc: text(100), amount: lineAmount });
const labelLine = z.object({ id: z.string().max(64), label: text(100), amount: lineAmount });

/** Logo data URL; size and magic bytes are checked again when decoded (logo.ts). */
const logo = z
  .string()
  .max(3_000_000, "Logo must be 2 MB or smaller")
  .refine((v) => v === "" || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v), "Logo must be a PNG or JPEG image")
  .optional()
  .default("");

export const paystubFormData = z
  .object({
    companyLogo: logo,
    companyName: required("Company name"),
    companyAddress: required("Company address"),
    companyCity: required("Company city", 100),
    companyState: state("Company state"),
    companyZip: zip("Company ZIP"),
    companyEin: optionalEin,
    companyPhone: optional(30),

    employeeName: required("Employee name"),
    employeeAddress: required("Employee address"),
    employeeCity: required("Employee city", 100),
    employeeState: state("Employee state"),
    employeeZip: zip("Employee ZIP"),
    employeeId: optional(50),

    payPeriodStart: isoDate("Pay period start"),
    payPeriodEnd: isoDate("Pay period end"),
    payDate: isoDate("Pay date"),
    payFrequency: z.enum(["Weekly", "Bi-Weekly", "Semi-Monthly", "Monthly"]),
    payType: z.enum(["Hourly", "Salary"]),
    hourlyRate: z.union([z.literal(""), money("Hourly rate")]).optional().default(""),
    regularHours: z.union([z.literal(""), hours("Regular hours")]).optional().default(""),
    overtimeHours: z.union([z.literal(""), hours("Overtime hours")]).optional().default(""),
    salaryAmount: z.union([z.literal(""), money("Salary amount")]).optional().default(""),

    additionalEarnings: z.array(descLine).max(20).default([]),
    taxes: z.array(labelLine).max(20).default([]),
    deductions: z.array(descLine).max(20).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.payPeriodEnd < d.payPeriodStart) {
      ctx.addIssue({ code: "custom", path: ["payPeriodEnd"], message: "Pay period end must be on or after the start" });
    }
    if (d.payType === "Hourly") {
      if (!d.hourlyRate) ctx.addIssue({ code: "custom", path: ["hourlyRate"], message: "Hourly rate is required" });
      if (!d.regularHours) ctx.addIssue({ code: "custom", path: ["regularHours"], message: "Regular hours are required" });
    } else if (!d.salaryAmount) {
      ctx.addIssue({ code: "custom", path: ["salaryAmount"], message: "Salary amount is required" });
    }
  });

export const w2FormData = z.object({
  taxYear,
  ein,
  employerName: required("Employer name"),
  streetAddress: required("Employer street address"),
  city: required("Employer city", 100),
  state: state("Employer state"),
  zipCode: zip("Employer ZIP"),
  controlNumber: optional(50),

  ssn,
  firstName: required("First name", 100),
  middleInitial: optional(1),
  lastName: required("Last name", 100),
  employeeAddress: required("Employee address"),
  employeeCity: required("Employee city", 100),
  employeeState: state("Employee state"),
  employeeZip: zip("Employee ZIP"),

  box1Wages: money("Box 1 wages"),
  box2FederalTax: money("Box 2 federal tax"),
  box3SocialSecurityWages: optionalMoney("Box 3"),
  box4SocialSecurityTax: optionalMoney("Box 4"),
  box5MedicareWages: optionalMoney("Box 5"),
  box6MedicareTax: optionalMoney("Box 6"),
  box7SocialSecurityTips: optionalMoney("Box 7"),
  box8AllocatedTips: optionalMoney("Box 8"),
  box10DependentCare: optionalMoney("Box 10"),
  box11NonqualifiedPlans: optionalMoney("Box 11"),
  box12Code: z.string().trim().regex(/^([A-Z]{1,2})?$/, "Box 12 code must be 1–2 letters").optional().default(""),
  box12Amount: optionalMoney("Box 12 amount"),
  box13StatutoryEmployee: z.boolean().default(false),
  box15State: z.union([z.literal(""), state("Box 15 state")]).optional().default(""),
  box15StateId: optional(50),
  box16StateWages: optionalMoney("Box 16"),
  box17StateTax: optionalMoney("Box 17"),
  box18LocalWages: optionalMoney("Box 18"),
  box19LocalTax: optionalMoney("Box 19"),
  box20Locality: optional(50),
});

export const nec1099FormData = z.object({
  taxYear,
  payerName: required("Payer name"),
  streetAddress: required("Payer street address"),
  city: required("Payer city", 100),
  state: state("Payer state"),
  zipCode: zip("Payer ZIP"),
  payerTin: tin,
  accountNumber: optional(50),

  recipientName: required("Recipient name"),
  recipientStreetAddress: required("Recipient street address"),
  recipientCity: required("Recipient city", 100),
  recipientState: state("Recipient state"),
  recipientZipCode: zip("Recipient ZIP"),
  recipientTin: tin,
  recipientAccountNumber: optional(50),

  box1NonemployeeComp: money("Box 1 nonemployee compensation"),
  box2DirectSales: z.boolean().default(false),
  box3ExcessGoldenParachute: optionalMoney("Box 3"),
  box4FederalTax: optionalMoney("Box 4"),
  stateReportingState: z.union([z.literal(""), state("State")]).optional().default(""),
  stateTaxWithheld: optionalMoney("State tax withheld"),
  statePayerNo: optional(50),
  stateIncome: optionalMoney("State income"),
});

export const directDepositFormData = z.object({
  employerName: required("Employer name"),
  streetAddress: required("Employer street address"),
  city: required("Employer city", 100),
  state: state("Employer state"),
  zipCode: zip("Employer ZIP"),
  employerContact: optional(100),

  employeeName: required("Employee name"),
  employeeAddress: required("Employee address"),
  employeeCity: required("Employee city", 100),
  employeeState: state("Employee state"),
  employeeZipCode: zip("Employee ZIP"),
  employeeId: optional(50),

  depositDate: required("Deposit date", 50),
  payPeriod: optional(100),
  paymentReference: optional(100),
  bankName: required("Bank name", 100),
  accountHolderName: required("Account holder name", 100),
  accountType: z.enum(["Checking", "Savings"]),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{4,17}$/, "Account number must be 4–17 digits")),
  depositAmount: money("Deposit amount"),
  paymentDescription: optional(200),
});

export const formDataSchemas = {
  paystub: paystubFormData,
  w2: w2FormData,
  nec1099: nec1099FormData,
  direct_deposit: directDepositFormData,
} as const;

export type PaystubFormData = z.output<typeof paystubFormData>;
export type W2FormData = z.output<typeof w2FormData>;
export type Nec1099FormData = z.output<typeof nec1099FormData>;
export type DirectDepositFormData = z.output<typeof directDepositFormData>;
