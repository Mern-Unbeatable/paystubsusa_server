import { formatCurrency } from "../utils/formatCurrency";
import { amountToCheckWords } from "../utils/numberToWords";
import { toLogoSrc } from "../utils/readLogoFile";

const PERIODS_PER_YEAR = {
  Weekly: 52,
  "Bi-Weekly": 26,
  "Semi-Monthly": 24,
  Monthly: 12,
};

const parseIsoDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

// "2026-05-01" -> "05/01/2026"
export const formatDate = (iso) => {
  const date = parseIsoDate(iso);
  if (!date) return iso || "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
};

// Pay periods elapsed this calendar year, used to project year-to-date totals.
const periodsToDate = (payDateIso, payFrequency) => {
  const perYear = PERIODS_PER_YEAR[payFrequency] ?? 26;
  const date = parseIsoDate(payDateIso);
  if (!date) return 1;
  const dayOfYear =
    Math.floor((date - new Date(date.getFullYear(), 0, 1)) / 86_400_000) + 1;
  return Math.min(perYear, Math.max(1, Math.ceil(dayOfYear / (365 / perYear))));
};

// Stable pseudo-random digits so reference numbers don't change between renders.
const stableDigits = (seed, length) => {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const digits = String(Math.abs(hash)).padStart(length, "7");
  return digits.slice(-length);
};

const money = (value) => formatCurrency(value);
const negativeMoney = (value) => `-${formatCurrency(value)}`;
const toNumber = (value) => parseFloat(value) || 0;
const joinCityLine = (city, state, zip) =>
  [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * Normalises the creation-form state into display-ready values shared by the
 * full-page templates (on-screen preview and printed PDF).
 */
export const buildPaystubDocument = (formData, calculations) => {
  const periods = periodsToDate(formData.payDate, formData.payFrequency);
  const ytd = (value) => value * periods;
  const seed = `${formData.employeeId}|${formData.companyName}|${formData.payDate}`;
  const rate = toNumber(formData.hourlyRate);

  const earnings = [];
  if (formData.payType === "Hourly") {
    earnings.push({
      label: "Regular",
      rate: money(rate),
      hours: toNumber(formData.regularHours).toFixed(2),
      amount: calculations.regularEarnings,
    });
    if (toNumber(formData.overtimeHours) > 0) {
      earnings.push({
        label: "Overtime",
        rate: money(rate * 1.5),
        hours: toNumber(formData.overtimeHours).toFixed(2),
        amount: calculations.overtimeEarnings,
      });
    }
  } else {
    earnings.push({ label: "Salary", rate: "", hours: "", amount: calculations.regularEarnings });
  }
  formData.additionalEarnings.forEach((item) => {
    earnings.push({ label: item.desc, rate: "", hours: "", amount: toNumber(item.amount) });
  });

  const toLineItems = (items, labelKey) =>
    items.map((item) => {
      const amount = toNumber(item.amount);
      return {
        label: item[labelKey],
        amount,
        amountText: money(amount),
        negativeText: negativeMoney(amount),
        ytdText: money(ytd(amount)),
      };
    });

  const checkNumber = stableDigits(`${seed}|check`, 6);

  return {
    company: {
      logo: toLogoSrc(formData.companyLogo),
      name: formData.companyName,
      address: formData.companyAddress,
      cityLine: joinCityLine(formData.companyCity, formData.companyState, formData.companyZip),
      ein: formData.companyEin,
      phone: formData.companyPhone || "",
    },
    employee: {
      name: formData.employeeName,
      address: formData.employeeAddress,
      cityLine: joinCityLine(formData.employeeCity, formData.employeeState, formData.employeeZip),
      id: formData.employeeId,
      ssnMasked: "XXX-XX-XXXX",
    },
    period: {
      start: formatDate(formData.payPeriodStart),
      end: formatDate(formData.payPeriodEnd),
      payDate: formatDate(formData.payDate),
      frequency: formData.payFrequency,
    },
    earnings: earnings.map((row) => ({
      ...row,
      amountText: money(row.amount),
      ytdText: money(ytd(row.amount)),
    })),
    taxes: toLineItems(formData.taxes, "label"),
    deductions: toLineItems(formData.deductions, "desc"),
    totals: {
      gross: money(calculations.totalGross),
      grossYtd: money(ytd(calculations.totalGross)),
      taxes: money(calculations.totalTaxes),
      taxesYtd: money(ytd(calculations.totalTaxes)),
      deductions: money(calculations.totalDeductions),
      deductionsYtd: money(ytd(calculations.totalDeductions)),
      net: money(calculations.netPay),
      netNegative: negativeMoney(calculations.netPay),
      netNumeric: calculations.netPay.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      netWords: amountToCheckWords(calculations.netPay),
    },
    reference: {
      checkNumber,
      adviceNumber: stableDigits(`${seed}|advice`, 7),
      companyCode: (formData.companyName || "CO").replace(/[^a-z]/gi, "").slice(0, 3).toLowerCase(),
      fileNumber: stableDigits(`${seed}|file`, 6),
      department: stableDigits(`${seed}|dept`, 6),
      clock: stableDigits(`${seed}|clock`, 5),
      voucher: checkNumber.slice(-5),
    },
    distributionType: "Check",
  };
};
