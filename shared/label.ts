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
  /** The pasted WhatsApp message ('' = typed by hand). A Prepaid price that came from it is not added again. */
  raw_message?: string | null;
  // COD only
  booking_date?: string | null;
  weight?: string | null;
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

const wordKey = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
/**
 * The Note without words that Product name already says, so nothing prints twice:
 * Product "Sankeswari awaj With Naal" + Note "Sankeswari awaj With Naal" -> ''
 * Product "Sankeswari" + Note "Sankeswari awaj With Naal" -> "awaj With Naal". Other notes stay as they are.
 */
export function noteWithoutProduct(product: string | null | undefined, note: string | null | undefined): string {
  const n = (note ?? '').trim();
  const p = (product ?? '').trim().split(/\s+/).map(wordKey).filter(Boolean);
  if (!n || !p.length) return n;
  const nWords = n.split(/\s+/);
  const nk = nWords.map(wordKey);
  const at = (hay: string[], needle: string[]) => {
    for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) return i;
    return -1;
  };
  const nkClean = nk.filter(Boolean);
  if (nkClean.length && at(p, nkClean) >= 0) return ''; // the note is part of the product name
  const i = at(nk, p);
  if (i < 0) return n;
  return [...nWords.slice(0, i), ...nWords.slice(i + p.length)].join(' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
}

/** The note already says this size as written ("SIZE- 9 CUTKAAN…", "Size-7 no sanke", "11 no black shahu"). */
export function noteSaysSize(note: string, size: string | null | undefined): boolean {
  const z = (size ?? '').trim();
  if (!z || !note) return false;
  const n = z.replace('.', '\\.');
  return new RegExp(`(?:size|sizes|साइज|साईज|माप)\\s*[-:–.]?\\s*${n}(?![\\d.])|(?<![\\d.])${n}\\s*(?:no\\b|number\\b|नंबर|नं)`, 'i').test(note);
}

/** The Note came from the pasted message (its words are in it, as written). */
export function noteIsPasted(o: LabelOrder): boolean {
  const flat = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const note = flat(o.note ?? '');
  return !!note && !!o.raw_message && ` ${flat(o.raw_message)} `.includes(` ${note} `);
}

/** PREPAID (Kolhapuri Kurundwad, 10 no, RED, 1299) – empty parts are skipped, nothing twice. */
export function orderLine(o: LabelOrder): string {
  // Note from the pasted message: only that note prints, exactly as written – nothing added from
  // Product name, Size or Amount (client, 5 Nov 2026). Otherwise the typed fields print.
  if (noteIsPasted(o)) return `${o.payment_type === 'PREPAID' ? 'PREPAID' : `COD ${formatAmount(o.amount)}`.trim()} (${o.note!.trim()})`;
  const note = noteWithoutProduct(o.product_name, o.note);
  // The pasted note is printed as written; "9 no" only when the note doesn't already say the size.
  const parts = [o.product_name?.trim(), o.size?.trim() && !noteSaysSize(note, o.size) ? `${o.size.trim()} no` : '', note];
  // Prepaid: the amount typed in the form prints last – "PREPAID (red capsi, 9 no, 1299)" – unless the
  // product / note / pasted message already show that price ("4veni 999+sol" with amount 999 -> printed once).
  const amt = formatAmount(o.amount);
  if (o.payment_type === 'PREPAID' && amt && Number(amt) > 0) {
    // also when the price came in the pasted message ("₹1,599.00 (estimated total)"): pasted orders stay as written
    const [int, dec] = amt.split('.');
    const num = `${int.length > 3 ? `${int.slice(0, -3)},?${int.slice(-3)}` : int}${dec ? `\\.${dec}` : '(?:\\.0+)?'}`;
    const shown = new RegExp(`(?<![\\d.,])${num}(?![\\d])`).test(`${o.product_name ?? ''} ${note} ${o.raw_message ?? ''}`);
    if (!shown) parts.push(amt);
  }
  const head = o.payment_type === 'PREPAID' ? 'PREPAID' : `COD ${amt}`.trim();
  const p = parts.filter(Boolean);
  return p.length ? `${head} (${p.join(', ')})` : head;
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
// COD label (India Post) – same layout as the shop's printed COD labels:
//
//               Booking Under Pune City West Division                       (centred)
//          Customer ID : 1634841966, Contract ID – 41282773                (centred, bold)
//      BNPL HUB Pune 411001, Weight : 800 g    Date : 03/11/2026           (centred)
//   COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY      (centred, bold)
//                                                   TO, <name>             (right, as Prepaid)
//                                                   address … (toLines)
//                                                   COD 1999 (Size 8 pona sanke awaj)
//   From :-  <shop>                                                         (left, as Prepaid)
//
// The fixed values come from shared/cod.ts. The Prepaid label above is not changed by any of this.
// ------------------------------------------------------------------------------------------------
const BLANK = '________';

/** The centred header: 4 lines. Index 1 and 3 are printed bold. A missing weight / date prints a blank. */
export function codHeadLines(o: LabelOrder): string[] {
  return [
    `Booking Under ${COD_FIXED.bookingUnder}`,
    `Customer ID : ${COD_FIXED.customerId}, Contract ID – ${COD_FIXED.contractId}`,
    `${COD_FIXED.hub}, Weight : ${o.weight?.trim() || BLANK}    Date : ${printDate(o.booking_date) || BLANK}`,
    codAmountLine(o),
  ];
}

/** "COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY" (amount from the order). */
export function codAmountLine(o: LabelOrder): string {
  const amt = formatAmount(o.amount);
  return `COD FOR RUPEES : ${amt || BLANK}/-${amountInWords(o.amount ?? null)}`;
}

/** The line under the address: "COD 1999 (Size 8 pona sanke awaj)" – size and description from the order. */
export function codOrderLine(o: LabelOrder): string {
  // Note from the pasted message: "COD 1799 (10 no Lokare shahu awaj)" – the note only, as written.
  if (noteIsPasted(o)) return `COD ${formatAmount(o.amount)}`.trim() + ` (${o.note!.trim()})`;
  const size = o.size?.trim();
  const note = noteWithoutProduct(o.product_name, o.note);
  // The note already says the size as written ("Size-7 no sanke"): print the note as it is, without "Size 7" again.
  const said = noteSaysSize(note, size);
  const sizeText = said ? note : [size ? `Size ${size}` : '', note].filter(Boolean).join(' ');
  const parts = [o.product_name?.trim(), sizeText].filter(Boolean);
  const head = `COD ${formatAmount(o.amount)}`.trim();
  return parts.length ? `${head} (${parts.join(', ')})` : head;
}

/** Two orders per A4 page (top half + bottom half). */
export const LABELS_PER_PAGE = 2;
export const pagesFor = (orderCount: number) => Math.ceil(orderCount / LABELS_PER_PAGE);
