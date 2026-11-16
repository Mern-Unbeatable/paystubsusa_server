import sampleLogo from "../../../../assets/logo.png";
import { buildPaystubDocument } from "./buildPaystubDocument";

// Mirrors the reference designs so thumbnails show a realistic, filled-in stub.
const SAMPLE_FORM_DATA = {
  companyName: "Northwind Logistics",
  companyAddress: "123 Example Rd.",
  companyCity: "Atlanta",
  companyState: "GA",
  companyZip: "12345",
  companyEin: "12-3456789",
  employeeName: "John Doe",
  employeeAddress: "123 Example Ln.",
  employeeCity: "Atlanta",
  employeeState: "GA",
  employeeZip: "12345",
  employeeId: "EMP1234",
  payPeriodStart: "2026-04-13",
  payPeriodEnd: "2026-04-26",
  payDate: "2026-05-01",
  payFrequency: "Bi-Weekly",
  payType: "Hourly",
  hourlyRate: "20",
  regularHours: "80",
  overtimeHours: "0",
  additionalEarnings: [],
  taxes: [
    { id: "med", label: "FICA - Medicare", amount: "23.20" },
    { id: "ss", label: "FICA - Social Security", amount: "99.20" },
    { id: "fed", label: "Federal Tax", amount: "108.15" },
    { id: "state", label: "State Tax", amount: "59.09" },
  ],
  deductions: [],
};

const SAMPLE_CALCULATIONS = {
  regularEarnings: 1600,
  overtimeEarnings: 0,
  totalGross: 1600,
  totalTaxes: 289.64,
  totalDeductions: 0,
  allDeductions: 289.64,
  netPay: 1310.36,
};

// Demo mark for gallery thumbnails and previews only; generated paystubs show the user's upload or nothing.
export const SAMPLE_LOGO = sampleLogo;

const sampleDocument = buildPaystubDocument(SAMPLE_FORM_DATA, SAMPLE_CALCULATIONS);

// Set after building: `buildPaystubDocument` only accepts uploaded data-URL logos.
export const SAMPLE_PAYSTUB_DOCUMENT = {
  ...sampleDocument,
  company: { ...sampleDocument.company, logo: SAMPLE_LOGO },
};
