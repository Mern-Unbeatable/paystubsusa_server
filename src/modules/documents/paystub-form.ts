/**
 * Paystub formData v2 (step-based) + legacy flat v1 normalization.
 * Calculation is never persisted from the client — server computes it.
 */

export const PAYSTUB_SCHEMA_VERSION = 2 as const;

export type PaystubEmployer = {
  companyLogo: string;
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyState: string;
  companyZip: string;
  companyEin: string;
  companyPhone: string;
};

export type PaystubEmployee = {
  employeeName: string;
  employeePhone: string;
  employeeAddress: string;
  employeeCity: string;
  employeeState: string;
  employeeZip: string;
  employeeId: string;
  ssnLast4: string;
  exemptions: string;
  maritalStatus: string;
};

export type PaystubPayDetails = {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  payFrequency: "Weekly" | "Bi-Weekly" | "Semi-Monthly" | "Monthly";
  payType: "Hourly" | "Salary";
  hourlyRate: string;
  regularHours: string;
  overtimeHours: string;
  salaryAmount: string;
  additionalEarnings: { id: string; desc: string; amount: string }[];
  taxes: { id: string; label: string; amount: string }[];
  deductions: { id: string; desc: string; amount: string }[];
};

export type PaystubDirectDeposit = {
  enabled: boolean;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber: string;
  checkNumber: string;
};

export type PaystubSteps = {
  employer: PaystubEmployer;
  employee: PaystubEmployee;
  payDetails: PaystubPayDetails;
  directDeposit: PaystubDirectDeposit;
};

export type PaystubFormDataV2 = {
  schemaVersion: typeof PAYSTUB_SCHEMA_VERSION;
  steps: PaystubSteps;
};

/** Flat fields expected by PDF builders (plus optional nested directDeposit). */
export type PaystubRenderFields = PaystubEmployer &
  PaystubEmployee &
  PaystubPayDetails & {
    directDeposit: PaystubDirectDeposit;
  };

const emptyDd = (): PaystubDirectDeposit => ({
  enabled: false,
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  routingNumber: "",
  checkNumber: "",
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when payload already uses the step-based shape. */
export function isPaystubStepsPayload(input: unknown): boolean {
  return isRecord(input) && isRecord(input.steps) && isRecord(input.steps.employer);
}

/** True when payload uses the legacy flat formData keys. */
export function isPaystubFlatPayload(input: unknown): boolean {
  return isRecord(input) && typeof input.companyName === "string" && !isRecord(input.steps);
}

/**
 * Strip client-only fields and coerce legacy flat → `{ schemaVersion: 2, steps }`.
 * Does not validate — Zod runs after this.
 */
export function normalizePaystubFormData(input: unknown): unknown {
  if (!isRecord(input)) return input;

  const { calculation: _calculation, template: _template, ...rest } = input;

  if (isRecord(rest.steps) && isRecord(rest.steps.employer)) {
    return {
      schemaVersion: PAYSTUB_SCHEMA_VERSION,
      steps: {
        employer: rest.steps.employer,
        employee: rest.steps.employee ?? {},
        payDetails: rest.steps.payDetails ?? {},
        directDeposit: isRecord(rest.steps.directDeposit)
          ? { ...emptyDd(), ...rest.steps.directDeposit }
          : emptyDd(),
      },
    };
  }

  // Legacy flat v1
  if (typeof rest.companyName === "string") {
    const {
      companyLogo,
      companyName,
      companyAddress,
      companyCity,
      companyState,
      companyZip,
      companyEin,
      companyPhone,
      employeeName,
      employeePhone,
      employeeAddress,
      employeeCity,
      employeeState,
      employeeZip,
      employeeId,
      ssnLast4,
      exemptions,
      maritalStatus,
      payPeriodStart,
      payPeriodEnd,
      payDate,
      payFrequency,
      payType,
      hourlyRate,
      regularHours,
      overtimeHours,
      salaryAmount,
      additionalEarnings,
      taxes,
      deductions,
      directDeposit,
      ..._ignored
    } = rest;

    return {
      schemaVersion: PAYSTUB_SCHEMA_VERSION,
      steps: {
        employer: {
          companyLogo,
          companyName,
          companyAddress,
          companyCity,
          companyState,
          companyZip,
          companyEin,
          companyPhone,
        },
        employee: {
          employeeName,
          employeePhone,
          employeeAddress,
          employeeCity,
          employeeState,
          employeeZip,
          employeeId,
          ssnLast4,
          exemptions,
          maritalStatus,
        },
        payDetails: {
          payPeriodStart,
          payPeriodEnd,
          payDate,
          payFrequency,
          payType,
          hourlyRate,
          regularHours,
          overtimeHours,
          salaryAmount,
          additionalEarnings,
          taxes,
          deductions,
        },
        directDeposit: isRecord(directDeposit) ? { ...emptyDd(), ...directDeposit } : emptyDd(),
      },
    };
  }

  return rest;
}

export function flattenPaystubSteps(steps: PaystubSteps): PaystubRenderFields {
  return {
    ...steps.employer,
    ...steps.employee,
    ...steps.payDetails,
    directDeposit: steps.directDeposit ?? emptyDd(),
  };
}

export function toPaystubFormDataV2(data: PaystubFormDataV2 | PaystubSteps): PaystubFormDataV2 {
  if ("steps" in data && data.steps) {
    return { schemaVersion: PAYSTUB_SCHEMA_VERSION, steps: data.steps };
  }
  return { schemaVersion: PAYSTUB_SCHEMA_VERSION, steps: data as PaystubSteps };
}
