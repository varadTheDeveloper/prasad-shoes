// On/off switches for features that are built but not offered yet.
// The app (hides the screens/fields) and the server (stores the safe default) both read this file.

export const FEATURES = {
  /**
   * Cash on Delivery. OFF for now: every order is saved as PREPAID, the COD choice and COD
   * totals are hidden everywhere. To offer COD later, set this to true and rebuild the app +
   * server – all COD code (validation, label line "COD 1299 (...)", COD totals) is still in place.
   */
  cod: false,
} as const;

export type PaymentType = 'COD' | 'PREPAID';

/** Payment type for new orders. */
export const DEFAULT_PAYMENT: PaymentType = FEATURES.cod ? 'COD' : 'PREPAID';

/** What is actually saved: while COD is off, everything is PREPAID. */
export function effectivePayment(p: string | null | undefined): PaymentType {
  if (!FEATURES.cod) return 'PREPAID';
  return p === 'PREPAID' ? 'PREPAID' : 'COD';
}
