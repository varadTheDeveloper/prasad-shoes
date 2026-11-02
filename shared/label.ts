// What gets printed on one parcel label. Used by the Word file (server) and the preview (app),
// so both always show exactly the same text.
import { stripContactInfo } from './parser';
import { COD_FIXED, amountInWords, printDate } from './cod';

export interface LabelOrder {
  ship_name: string;
  address: string;
  landmark?: string | null;
  district?: string | null;
  state?: string | null;
  pincode: string;
  mobile1: string;
  mobile2?: string | null;
  product_name?: string | null;
  size?: string | null;
  note?: string | null;
  payment_type: 'COD' | 'PREPAID';
  amount?: number | null;
  // COD only
  booking_date?: string | null;
  weight?: string | null;
  sender_name?: string | null;
  sender_address?: string | null;
  sender_mobile?: string | null;
}

export interface LabelShop {
  shop_name: string;
  address1: string;
  address2?: string | null;
  city_pin: string;
  phones: string;
}

export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** COD 1299 (Kolhapuri Kurundwad, 10 no, RED KURUNDWAD) – empty parts are skipped. */
export function orderLine(o: LabelOrder): string {
  const parts = [o.product_name?.trim(), o.size?.trim() ? `${o.size.trim()} no` : '', o.note?.trim()].filter(Boolean);
  const head = o.payment_type === 'PREPAID' ? 'PREPAID' : `COD ${formatAmount(o.amount)}`.trim();
  return parts.length ? `${head} (${parts.join(', ')})` : head;
}

/**
 * The "TO" block lines under the "TO, <name>" line, in the shop's order:
 * address, landmark, district, state, mobile, pincode (the COD / PREPAID line comes after these).
 * Nothing is printed twice: a pincode / mobile typed inside the address is left out of the address
 * (it has its own line), and a landmark / district / state already written in the address is skipped.
 */
export function toLines(o: LabelOrder): string[] {
  const pins = [o.pincode];
  const mobs = [o.mobile1, o.mobile2];
  const address = stripContactInfo(o.address ?? '', pins, mobs)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const landmark = stripContactInfo(o.landmark?.trim() ?? '', pins, mobs);
  const addrText = address.join(' ').toLowerCase();
  const lines: string[] = [];
  lines.push(...address);
  if (landmark && !addrText.includes(landmark.toLowerCase())) lines.push(landmark);
  const seen = () => lines.join(' ').toLowerCase();
  for (const x of [o.district?.trim(), o.state?.trim()]) if (x && !seen().includes(x.toLowerCase())) lines.push(x);
  lines.push(`Mob. ${[...new Set(mobs.filter(Boolean))].join(', ')}`);
  lines.push(`Pin code ${o.pincode}`);
  return lines;
}

const dot = (s: string) => (/[.]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The "From :-" block lines (heading not included). */
export function fromLines(s: LabelShop): string[] {
  return [
    s.shop_name.trim(),
    s.address1.trim(),
    dot([s.address2?.trim(), s.city_pin.trim()].filter(Boolean).join(', ')),
    dot(`Mob. ${s.phones.trim()}`),
  ];
}

// ------------------------------------------------------------------------------------------------
// COD label (India Post). Printed in this order:
//   Booking Under / Customer ID / Contract ID (fixed, shared/cod.ts) -> Booking Date + Weight ->
//   COD amount (figures + words) -> TO, receiver name + address -> From (sender, or the shop).
// The Prepaid label above is not changed by any of this.
// ------------------------------------------------------------------------------------------------
const BLANK = '__________';

/** The fixed India Post lines + booking date / weight. A missing date / weight prints a blank to write in. */
export function codHeadLines(o: LabelOrder): string[] {
  return [
    `Booking Under: ${COD_FIXED.bookingUnder}`,
    `Customer ID: ${COD_FIXED.customerId}`,
    `Contract ID: ${COD_FIXED.contractId}`,
    `Booking Date: ${printDate(o.booking_date) || BLANK}   Weight: ${o.weight?.trim() || BLANK}`,
  ];
}

/** "COD Amount: Rs. 1299/-" and "(Rupees One Thousand Two Hundred Ninety Nine Only)". */
export function codAmountLines(o: LabelOrder): string[] {
  const amt = formatAmount(o.amount);
  const words = amountInWords(o.amount ?? null);
  return [`COD Amount: Rs. ${amt || BLANK}/-`, ...(words ? [`(${words})`] : [])];
}

/** Product / size / note under the amount: "(Kolhapuri Kurundwad, 10 no, RED)" – '' when all are empty. */
export function codItemLine(o: LabelOrder): string {
  const parts = [o.product_name?.trim(), o.size?.trim() ? `${o.size.trim()} no` : '', o.note?.trim()].filter(Boolean);
  return parts.length ? `(${parts.join(', ')})` : '';
}

/** "From" block of a COD label: the sender from the message, or the shop when none was given. */
export function codFromLines(o: LabelOrder, shop: LabelShop): string[] {
  const name = o.sender_name?.trim();
  const address = (o.sender_address ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!name && !address.length) return fromLines(shop);
  const mob = o.sender_mobile?.trim();
  return [...(name ? [name] : []), ...address, ...(mob ? [`Mob. ${mob}`] : [])];
}

/** Two orders per A4 page (top half + bottom half). */
export const LABELS_PER_PAGE = 2;
export const pagesFor = (orderCount: number) => Math.ceil(orderCount / LABELS_PER_PAGE);
