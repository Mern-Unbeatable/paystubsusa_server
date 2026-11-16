import { formatCurrency } from "../utils/formatCurrency";
import { formatDate } from "./buildPaystubDocument";
import { toLogoSrc } from "../utils/readLogoFile";

const toNumber = (value) => parseFloat(value) || 0;
const joinCityLine = (city, state, zip) =>
  [city, state, zip].filter(Boolean).join(", ");

/**
 * Maps the creation form onto the shape of `templateStubData.json`, so the
 * variant-based templates (01–08) render the user's data in their own design.
 */
export const buildThumbnailData = (formData, calculations) => {
  const earnings = [];
  if (formData.payType === "Hourly") {
    earnings.push({
      desc: "Regular",
      rate: `${toNumber(formData.regularHours)}h × ${formatCurrency(toNumber(formData.hourlyRate))}`,
      amount: formatCurrency(calculations.regularEarnings),
    });
    if (toNumber(formData.overtimeHours) > 0) {
      earnings.push({
        desc: "Overtime",
        rate: `${toNumber(formData.overtimeHours)}h × 1.5`,
        amount: formatCurrency(calculations.overtimeEarnings),
      });
    }
  } else {
    earnings.push({ desc: "Salary", rate: "", amount: formatCurrency(calculations.regularEarnings) });
  }
  formData.additionalEarnings.forEach((item) => {
    earnings.push({ desc: item.desc, rate: "", amount: formatCurrency(toNumber(item.amount)) });
  });

  return {
    company: {
      logo: toLogoSrc(formData.companyLogo),
      name: formData.companyName,
      address: formData.companyAddress,
      cityStateZip: joinCityLine(formData.companyCity, formData.companyState, formData.companyZip),
      ein: formData.companyEin ? `EIN: ${formData.companyEin}` : "",
      phone: formData.companyPhone || "",
    },
    statement: {
      title: "EARNINGS STATEMENT",
      payDate: `Pay Date: ${formatDate(formData.payDate)}`,
    },
    employee: {
      name: formData.employeeName,
      address: formData.employeeAddress,
      cityStateZip: joinCityLine(formData.employeeCity, formData.employeeState, formData.employeeZip),
    },
    payPeriod: {
      dates: `${formatDate(formData.payPeriodStart)} - ${formatDate(formData.payPeriodEnd)}`,
      frequency: formData.payFrequency,
      id: formData.employeeId ? `ID: ${formData.employeeId}` : "",
    },
    netPay: formatCurrency(calculations.netPay),
    earnings,
    grossPay: formatCurrency(calculations.totalGross),
    taxes: formData.taxes.map((t) => ({ desc: t.label, amount: formatCurrency(toNumber(t.amount)) })),
    totalTaxes: formatCurrency(calculations.totalTaxes),
    summary: {
      gross: formatCurrency(calculations.totalGross),
      deductions: formatCurrency(calculations.allDeductions),
      net: formatCurrency(calculations.netPay),
    },
  };
};
