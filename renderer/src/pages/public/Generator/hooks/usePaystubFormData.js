import { useMemo } from "react";
import { useSessionStorageState } from "../../../../hooks/useSessionStorageState";

const FORM_DATA_STORAGE_KEY = "paystubGenerator.formData";

// Defaults match the Figma mock so the live preview is populated on first load.
const DEFAULT_FORM_DATA = {
  // Step 1: Employer Information
  companyLogo: "", // data URL of the uploaded logo
  companyName: "Acme Corporation",
  companyAddress: "123 Main Street",
  companyCity: "Des Moines",
  companyState: "IA",
  companyZip: "50309",
  companyEin: "12-3456789",
  companyPhone: "",

  // Step 2: Employee Information
  employeeName: "Jane Doe",
  employeeAddress: "123 main street",
  employeeCity: "dhaka",
  employeeState: "IA",
  employeeZip: "10001",
  employeeId: "EMP-002",

  // Step 3: Pay Details
  payPeriodStart: "2026-10-24",
  payPeriodEnd: "2026-10-29",
  payDate: "2026-10-30",
  payFrequency: "Semi-Monthly",
  payType: "Hourly", // 'Hourly' | 'Salary'
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
};

const sumAmounts = (items) =>
  (items ?? []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

export const calculatePaystub = (formData) => {
  let regularEarnings = 0;
  let overtimeEarnings = 0;
  let totalGross = 0;

  if (formData.payType === "Hourly") {
    const rate = parseFloat(formData.hourlyRate) || 0;
    const hours = parseFloat(formData.regularHours) || 0;
    const otHours = parseFloat(formData.overtimeHours) || 0;
    regularEarnings = rate * hours;
    overtimeEarnings = rate * 1.5 * otHours;
    totalGross = regularEarnings + overtimeEarnings;
  } else {
    totalGross = parseFloat(formData.salaryAmount) || 0;
    regularEarnings = totalGross;
  }

  totalGross += sumAmounts(formData.additionalEarnings);

  const totalTaxes = sumAmounts(formData.taxes);
  const totalDeductions = sumAmounts(formData.deductions);
  const allDeductions = totalTaxes + totalDeductions;
  const netPay = Math.max(0, totalGross - allDeductions);

  return {
    regularEarnings,
    overtimeEarnings,
    totalGross,
    totalTaxes,
    totalDeductions,
    allDeductions,
    netPay,
  };
};

// Same required fields as the server's paystub schema; formats are still validated there.
const REQUIRED_FIELDS = [
  { step: 1, key: "companyName", label: "Company name" },
  { step: 1, key: "companyAddress", label: "Company address" },
  { step: 1, key: "companyCity", label: "Company city" },
  { step: 1, key: "companyState", label: "Company state" },
  { step: 1, key: "companyZip", label: "Company ZIP code" },
  { step: 2, key: "employeeName", label: "Employee name" },
  { step: 2, key: "employeeAddress", label: "Employee address" },
  { step: 2, key: "employeeCity", label: "Employee city" },
  { step: 2, key: "employeeState", label: "Employee state" },
  { step: 2, key: "employeeZip", label: "Employee ZIP code" },
  { step: 3, key: "payPeriodStart", label: "Pay period start" },
  { step: 3, key: "payPeriodEnd", label: "Pay period end" },
  { step: 3, key: "payDate", label: "Pay date" },
  { step: 3, key: "payFrequency", label: "Pay frequency" },
  { step: 3, key: "hourlyRate", label: "Hourly rate", when: (d) => d.payType === "Hourly" },
  { step: 3, key: "regularHours", label: "Regular hours", when: (d) => d.payType === "Hourly" },
  { step: 3, key: "salaryAmount", label: "Gross salary amount", when: (d) => d.payType !== "Hourly" },
];

/** First empty required field as `{ step, label }`, or null when the form is complete. */
export const findIncompleteField = (formData) =>
  REQUIRED_FIELDS.find(
    (f) => (!f.when || f.when(formData)) && !String(formData[f.key] ?? "").trim(),
  ) ?? null;

/** Paystub details shared across every page of the generator flow. */
export function usePaystubFormData() {
  const [formData, setFormData] = useSessionStorageState(
    FORM_DATA_STORAGE_KEY,
    DEFAULT_FORM_DATA,
  );

  const calculations = useMemo(() => calculatePaystub(formData), [formData]);

  const updateField = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const addRow = (listKey, row) =>
    setFormData((prev) => ({
      ...prev,
      [listKey]: [...prev[listKey], { id: Date.now().toString(), ...row }],
    }));

  const removeRow = (listKey, id) =>
    setFormData((prev) => ({
      ...prev,
      [listKey]: prev[listKey].filter((item) => item.id !== id),
    }));

  return {
    formData,
    setFormData,
    updateField,
    calculations,
    handleAddTax: () => addRow("taxes", { label: "Custom Tax", amount: "0.00" }),
    handleRemoveTax: (id) => removeRow("taxes", id),
    handleTaxAmountChange: (id, amount) =>
      setFormData((prev) => ({
        ...prev,
        taxes: prev.taxes.map((t) => (t.id === id ? { ...t, amount } : t)),
      })),
    handleAddEarning: () =>
      addRow("additionalEarnings", { desc: "Bonus / Commission", amount: "0.00" }),
    handleRemoveEarning: (id) => removeRow("additionalEarnings", id),
    handleAddDeduction: () =>
      addRow("deductions", { desc: "401(k) / Insurance", amount: "0.00" }),
    handleRemoveDeduction: (id) => removeRow("deductions", id),
  };
}
