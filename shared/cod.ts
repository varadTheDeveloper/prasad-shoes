// Cash on Delivery (India Post) – the fixed booking details and helpers for COD labels.
// The three fixed values below print on EVERY COD label. They are never typed by staff and never
// read from the pasted message. To change them, edit this file and update the app + server.

export const COD_FIXED = {
  bookingUnder: 'Pune City West Division',
  customerId: '1634841966',
  contractId: '41282773',
  hub: 'BNPL HUB Pune 411001',
} as const;

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function upTo99(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ');
}

function upTo999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? upTo99(r) : ''].filter(Boolean).join(' ');
}

/** Whole number in Indian words: 125000 -> "One Lakh Twenty Five Thousand". */
export function numberInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (rest) parts.push(upTo999(rest));
  return parts.join(' ');
}

/** As printed on the COD label: 1999 -> "ONE THOUSAND NINE HUNDRED NINETY NINE ONLY";
 *  1999.5 -> "ONE THOUSAND NINE HUNDRED NINETY NINE AND FIFTY PAISE ONLY". '' when there is no amount. */
export function amountInWords(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) return '';
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  const words = paise ? `${numberInWords(rupees)} and ${upTo99(paise)} Paise Only` : `${numberInWords(rupees)} Only`;
  return words.toUpperCase();
}

/** '2026-11-03' -> '03/11/2026' (as written on the shop's COD labels). '' for no date. */
export function printDate(iso: string | null | undefined): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Is 'YYYY-MM-DD' a real calendar date? */
export function isIsoDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
