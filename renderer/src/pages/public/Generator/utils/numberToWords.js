const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const SCALES = ["", "THOUSAND", "MILLION", "BILLION"];

const underThousandToWords = (n) => {
  const words = [];
  if (n >= 100) {
    words.push(ONES[Math.floor(n / 100)], "HUNDRED");
    n %= 100;
  }
  if (n >= 20) {
    words.push(TENS[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) words.push(ONES[n]);
  return words.join(" ");
};

const integerToWords = (n) => {
  if (n === 0) return "ZERO";
  const parts = [];
  let scaleIndex = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      parts.unshift(
        [underThousandToWords(chunk), SCALES[scaleIndex]].filter(Boolean).join(" "),
      );
    }
    n = Math.floor(n / 1000);
    scaleIndex += 1;
  }
  return parts.join(" ");
};

/** 1310.36 -> "ONE THOUSAND THREE HUNDRED TEN AND 36/100 DOLLARS" (check style). */
export const amountToCheckWords = (amount) => {
  const totalCents = Math.round(Math.max(0, amount || 0) * 100);
  const dollars = Math.floor(totalCents / 100);
  const cents = String(totalCents % 100).padStart(2, "0");
  return `${integerToWords(dollars)} AND ${cents}/100 DOLLARS`;
};
