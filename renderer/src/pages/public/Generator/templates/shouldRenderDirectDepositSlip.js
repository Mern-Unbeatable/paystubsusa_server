/**
 * Paid add-on / legacy gate for the detachable slip.
 * - includeInPdf === true → purchased (new checkouts)
 * - includeInPdf === false → explicitly not purchased
 * - includeInPdf omitted → legacy docs paid while the slip was free (`enabled`)
 */
export const shouldRenderDirectDepositSlip = (dd) => {
  if (!dd) return false;
  if (dd.includeInPdf === true) return true;
  if (dd.includeInPdf === false) return false;
  return Boolean(dd.enabled);
};
