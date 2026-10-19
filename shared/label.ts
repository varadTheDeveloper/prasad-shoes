// What gets printed on one parcel label. Used by the Word file (server) and the preview (app),
// so both always show exactly the same text.
import { stripContactInfo } from './parser';

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
 * The "TO" block lines under the "TO, <name>" line: address, landmark, district/state, pincode, mobiles.
 * Nothing is printed twice: a pincode / mobile typed inside the address is left out of the address
 * (it has its own line), and a landmark / district / state already written in the address is skipped.
 */
export function toLines(o: LabelOrder): string[] {
  const pins = [o.pincode];
  const mobs = [o.mobile1, o.mobile2];
  const lines: string[] = [];
  const address = stripContactInfo(o.address ?? '', pins, mobs);
  for (const l of address.split('\n')) if (l.trim()) lines.push(l.trim());
  const seen = () => lines.join(' ').toLowerCase();
  const landmark = stripContactInfo(o.landmark?.trim() ?? '', pins, mobs);
  if (landmark && !seen().includes(landmark.toLowerCase())) lines.push(landmark);
  const ds = [o.district?.trim(), o.state?.trim()].filter((x): x is string => !!x && !seen().includes(x.toLowerCase()));
  if (ds.length) lines.push(ds.join(', '));
  lines.push(`Pin code ${o.pincode}`);
  lines.push(`Mob. ${[...new Set(mobs.filter(Boolean))].join(', ')}`);
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

/** Two orders per A4 page (top half + bottom half). */
export const LABELS_PER_PAGE = 2;
export const pagesFor = (orderCount: number) => Math.ceil(orderCount / LABELS_PER_PAGE);
