// On/off switches for features. The app (shows/hides screens and fields) and the server
// (stores the safe default) both read this file.

export const FEATURES = {
  /**
   * Cash on Delivery. ON since 3 Nov 2026: staff pick Prepaid or COD before pasting.
   * COD orders print the COD label (fixed India Post booking details from shared/cod.ts,
   * booking date, weight, COD amount in figures and words, receiver, sender).
   * Set to false to hide COD again: every new order is then saved as PREPAID.
   */
  cod: true,
} as const;

export type PaymentType = 'COD' | 'PREPAID';

/** Shipment type for new orders: Prepaid unless COD is picked. */
export const DEFAULT_PAYMENT: PaymentType = 'PREPAID';

/** What is actually saved: COD only when COD is on and was picked, otherwise PREPAID. */
export function effectivePayment(p: string | null | undefined): PaymentType {
  if (!FEATURES.cod) return 'PREPAID';
  return p === 'COD' ? 'COD' : 'PREPAID';
}
