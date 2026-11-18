/**
 * Smoke-test PlaywrightRenderer against the offline bundle for all document types.
 * Usage (from server/): node --env-file-if-exists=.env scripts/smoke-render.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PlaywrightRenderer } from "../src/integrations/renderer.ts";

const template = {
  code: "01",
  renderer: "classic",
  variant: { accent: "#1E60F2" },
};

const paystubFormData = {
  schemaVersion: 2,
  steps: {
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
      employeeAddress: "123 main street",
      employeeCity: "Des Moines",
      employeeState: "IA",
      employeeZip: "50309",
      employeeId: "EMP-002",
      ssnLast4: "6789",
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
        { id: "fed", label: "Federal Income Tax", amount: "100.00" },
        { id: "ss", label: "Social Security", amount: "50.00" },
        { id: "med", label: "Medicare", amount: "40.00" },
        { id: "state", label: "State Income Tax", amount: "0.00" },
      ],
      deductions: [],
    },
    directDeposit: {
      enabled: true,
      bankName: "First National Bank",
      accountHolderName: "Jane Doe",
      accountNumber: "123456789",
      routingNumber: "021000021",
      checkNumber: "100245",
    },
  },
};

const samples = [
  { type: "paystub", formData: paystubFormData },
  {
    type: "w2",
    formData: {
      ssn: "000-00-0000",
      ein: "12-3456789",
      employerName: "Acme",
      employerAddress: "123 Main",
      employerCity: "Des Moines",
      employerState: "IA",
      employerZip: "50309",
      firstName: "Jane",
      lastName: "Doe",
      employeeAddress: "2 Oak",
      employeeCity: "Des Moines",
      employeeState: "IA",
      employeeZip: "50309",
      taxYear: 2025,
      wagesTipsOther: "50000",
      federalIncomeTaxWithheld: "5000",
    },
  },
  {
    type: "nec1099",
    formData: {
      payerName: "Acme",
      streetAddress: "123 Main",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      recipientName: "Jane Doe",
      nonemployeeCompensation: "12000",
      taxYear: 2025,
    },
  },
  {
    type: "direct_deposit",
    formData: {
      companyName: "Acme",
      employeeName: "Jane Doe",
      amount: "1500.00",
      accountType: "Checking",
      routingNumber: "021000021",
      accountNumber: "****1234",
    },
  },
];

const outDir = path.resolve(".storage/smoke-render");
await mkdir(outDir, { recursive: true });

// Rebuild note: run `npm run build:renderer` after changing server/renderer/.
const renderer = new PlaywrightRenderer();
try {
  for (const sample of samples) {
    const pdf = await renderer.render({
      type: sample.type,
      template,
      formData: sample.formData,
    });
    const file = path.join(outDir, `${sample.type}.pdf`);
    await writeFile(file, pdf);
    console.log(`OK ${sample.type}: ${pdf.length} bytes -> ${file}`);
  }
} finally {
  await renderer.close();
}
