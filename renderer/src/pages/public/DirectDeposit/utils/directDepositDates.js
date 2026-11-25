/** Normalize stored values to `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInputValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return "";
}

/** `YYYY-MM-DD` or `MM/DD/YYYY` → `MM/DD/YYYY` for the slip / review UI. */
export function formatDisplayDate(value) {
  const iso = toDateInputValue(value);
  if (!iso) return String(value || "").trim();
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** Build a readable pay-period range from two ISO (or US) dates. */
export function formatPayPeriodRange(start, end) {
  const a = formatDisplayDate(start);
  const b = formatDisplayDate(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}
