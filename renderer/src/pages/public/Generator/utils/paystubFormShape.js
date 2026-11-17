/** Paystub step-based form shape (v2) + legacy flat helpers. */

export const PAYSTUB_SCHEMA_VERSION = 2;

export const DEFAULT_DIRECT_DEPOSIT = {
  enabled: false,
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  routingNumber: "",
  checkNumber: "",
};

export const DEFAULT_STEPS = {
  employer: {
    companyLogo: "",
    companyName: "Acme Corporation",
    companyAddress: "123 Main Street",
    companyCity: "Des Moines",
    companyState: "IA",
    companyZip: "50309",
    companyEin: "12-3456789",
    companyPhone: "",
  },
  employee: {
    employeeName: "Jane Doe",
    employeePhone: "",
    employeeAddress: "123 main street",
    employeeCity: "dhaka",
    employeeState: "IA",
    employeeZip: "10001",
    employeeId: "EMP-002",
    ssnLast4: "",
    exemptions: "0",
    maritalStatus: "",
    employmentType: "Employee",
  },
  payDetails: {
    payPeriodStart: "2026-10-24",
    payPeriodEnd: "2026-10-29",
    payDate: "2026-10-30",
    payFrequency: "Semi-Monthly",
    payType: "Hourly",
    hourlyRate: "200",
    regularHours: "80",
    overtimeHours: "20",
    salaryAmount: "22000",
    additionalEarnings: [],
    taxes: [
      { id: "fed", label: "Federal Income Tax", amount: "0.00" },
      { id: "ss", label: "Social Security", amount: "0.00" },
      { id: "med", label: "Medicare", amount: "0.00" },
      { id: "state", label: "State Income Tax", amount: "0.00" },
    ],
    deductions: [],
  },
  directDeposit: { ...DEFAULT_DIRECT_DEPOSIT },
};

const EMPLOYER_KEYS = new Set(Object.keys(DEFAULT_STEPS.employer));
const EMPLOYEE_KEYS = new Set(Object.keys(DEFAULT_STEPS.employee));
const PAY_KEYS = new Set(Object.keys(DEFAULT_STEPS.payDetails));
const DD_KEYS = new Set(Object.keys(DEFAULT_DIRECT_DEPOSIT));

export function fieldStep(field) {
  if (EMPLOYER_KEYS.has(field)) return "employer";
  if (EMPLOYEE_KEYS.has(field)) return "employee";
  if (PAY_KEYS.has(field)) return "payDetails";
  if (DD_KEYS.has(field)) return "directDeposit";
  return null;
}

export function flatToSteps(flat) {
  if (!flat || typeof flat !== "object") return structuredClone(DEFAULT_STEPS);
  const pick = (keys, fallback) => {
    const out = { ...fallback };
    for (const key of Object.keys(fallback)) {
      if (flat[key] !== undefined) out[key] = flat[key];
    }
    return out;
  };
  return {
    employer: pick(EMPLOYER_KEYS, DEFAULT_STEPS.employer),
    employee: pick(EMPLOYEE_KEYS, DEFAULT_STEPS.employee),
    payDetails: pick(PAY_KEYS, DEFAULT_STEPS.payDetails),
    directDeposit: {
      ...DEFAULT_DIRECT_DEPOSIT,
      ...(flat.directDeposit && typeof flat.directDeposit === "object"
        ? flat.directDeposit
        : {}),
    },
  };
}

/** Session / API value → steps object. */
export function coerceToSteps(stored) {
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_STEPS);
  if (stored.steps?.employer) {
    return {
      employer: { ...DEFAULT_STEPS.employer, ...stored.steps.employer },
      employee: { ...DEFAULT_STEPS.employee, ...stored.steps.employee },
      payDetails: { ...DEFAULT_STEPS.payDetails, ...stored.steps.payDetails },
      directDeposit: {
        ...DEFAULT_DIRECT_DEPOSIT,
        ...(stored.steps.directDeposit ?? {}),
      },
    };
  }
  if (stored.employer?.companyName !== undefined || stored.payDetails) {
    return {
      employer: { ...DEFAULT_STEPS.employer, ...stored.employer },
      employee: { ...DEFAULT_STEPS.employee, ...stored.employee },
      payDetails: { ...DEFAULT_STEPS.payDetails, ...stored.payDetails },
      directDeposit: {
        ...DEFAULT_DIRECT_DEPOSIT,
        ...(stored.directDeposit ?? {}),
      },
    };
  }
  if (typeof stored.companyName === "string") return flatToSteps(stored);
  return structuredClone(DEFAULT_STEPS);
}

/** Flat view for existing UI / PDF builders (includes nested directDeposit). */
export function flattenSteps(steps) {
  const s = coerceToSteps(steps);
  return {
    ...s.employer,
    ...s.employee,
    ...s.payDetails,
    directDeposit: { ...DEFAULT_DIRECT_DEPOSIT, ...s.directDeposit },
  };
}

/** Encrypted order payload — no client calculation. */
export function toPaystubApiFormData(steps) {
  return {
    schemaVersion: PAYSTUB_SCHEMA_VERSION,
    steps: coerceToSteps(steps),
  };
}
