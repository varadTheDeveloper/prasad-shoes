// WhatsApp message -> order fields.
// Used by the app (instant auto-fill while pasting). Pure TypeScript, no dependencies.
//
// How it works:
//  1. Clean the text: drop WhatsApp noise (times, "You", "[12:39 pm, 18/10/2026] Name:" prefixes),
//     read the amount from lines like "₹1,599.00 (estimated total)" or a bare "1599".
//  2. Read labelled lines: Naam / Address / Landmark / District / State / Pincode / Mobile No 1 / Mobile No 2 / Size
//     in English, Marathi or Hindi. Text after the label ("-", ":", ".") is the value.
//     A label with nothing after it takes the next line(s).
//  3. Fallbacks: 6-digit number = pincode, 10-digit number (+91 optional) = mobile,
//     first unlabelled line = name, other unlabelled lines = address.
//  4. State is guessed from the pincode's first digits when the message has none.

export type ParsedField =
  | 'ship_name'
  | 'address'
  | 'landmark'
  | 'district'
  | 'state'
  | 'pincode'
  | 'mobile1'
  | 'mobile2'
  | 'size'
  | 'amount';

export interface ParseResult {
  ship_name: string;
  address: string;
  landmark: string;
  district: string;
  state: string;
  pincode: string;
  mobile1: string;
  mobile2: string;
  size: string;
  amount: number | null;
  /** Fields that were filled (for the "8 fields auto-filled" chip). */
  filled: ParsedField[];
  /** Fields that should be checked by a person: empty required fields and guessed values. */
  missing: ParsedField[];
  guessed: ParsedField[];
}

type Key = Exclude<ParsedField, 'amount'>;

// ---------------------------------------------------------------------------------------------
// Label dictionary. Order matters: more specific labels first (Mobile 2 before Mobile 1).
// A label must be followed by the end of line or a separator / space.
// ---------------------------------------------------------------------------------------------
const END = '(?=$|[\\s:：\\-–—.=,)>])';
const LABELS: { key: Key; re: RegExp }[] = [
  { key: 'mobile2', re: new RegExp(`^(?:alt(?:ernate)?\\.?\\s*(?:mob(?:ile)?|ph(?:one)?|no|number|contact)?|(?:mob(?:ile)?|ph(?:one)?|contact|whats\\s?app|मोबाईल|मोबाइल|फोन)\\.?\\s*(?:no|num|number|नं|नंबर|क्र)?\\.?\\s*[-:]?\\s*(?:2|२|ii|two)|(?:second|दुसरा)\\s*(?:mob(?:ile)?|no|number|नंबर)?)${END}`, 'i') },
  { key: 'mobile1', re: new RegExp(`^(?:(?:mob(?:ile)?|ph(?:one)?|cell|contact|whats\\s?app|मोबाईल|मोबाइल|फोन|संपर्क)\\.?\\s*(?:no|num|number|नं|नंबर|क्र)?\\.?\\s*(?:[-:]?\\s*(?:1|१|i|one)(?![0-9]))?)${END}`, 'i') },
  { key: 'pincode', re: new RegExp(`^(?:pin\\s*-?\\s*code|pincode|pin\\s*no|pin|postal\\s*code|zip(?:\\s*code)?|पिन\\s*कोड|पिनकोड|पिन)${END}`, 'i') },
  { key: 'landmark', re: new RegExp(`^(?:land\\s*mark|nearby|near\\s*by|लँडमार्क|लॅंडमार्क|लैंडमार्क|खूण)${END}`, 'i') },
  { key: 'district', re: new RegExp(`^(?:district|dist|distt|zilla|zilha|jilha|jila|जिल्हा|जिला)${END}`, 'i') },
  { key: 'state', re: new RegExp(`^(?:state|राज्य)${END}`, 'i') },
  { key: 'size', re: new RegExp(`^(?:size|sizes|shoe\\s*size|साइज|साईज|माप)${END}`, 'i') },
  { key: 'ship_name', re: new RegExp(`^(?:naam|nam|name|full\\s*name|customer\\s*name|नाव|नाम|पूर्ण\\s*नाव)${END}`, 'i') },
  { key: 'address', re: new RegExp(`^(?:address|addr|add|full\\s*address|पत्ता|पता)${END}`, 'i') },
];

// ---------------------------------------------------------------------------------------------
// Misspelt labels: customers type "Landmmark", "Adress", "Pincod", "Mobil no1", "Distric"...
// The first word (or first two words joined) is compared with each label by edit distance.
// Long labels allow 2 typos, 5–6 letter labels allow 1. Short labels use a fixed typo list.
// ---------------------------------------------------------------------------------------------
const FUZZY: { key: Key; words: string[]; typos?: string[] }[] = [
  { key: 'landmark', words: ['landmark', 'nearby'] },
  { key: 'address', words: ['address', 'fulladdress'] },
  { key: 'pincode', words: ['pincode', 'pinno', 'postalcode'] },
  { key: 'district', words: ['district'] },
  { key: 'mobile1', words: ['mobile', 'mobileno', 'mobilenumber', 'phoneno', 'contact', 'contactno'] },
  { key: 'state', words: [], typos: ['sate', 'stat', 'staet', 'stae', 'stete', 'satte'] },
  { key: 'ship_name', words: [], typos: ['naame', 'nmae', 'naav', 'nane', 'neme'] },
  { key: 'size', words: [], typos: ['sise', 'siz', 'sizee', 'saiz', 'saize', 'syze'] },
];

/** Edit distance (with swapped neighbours counting as one edit). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const allowedTypos = (word: string) => (word.length >= 7 ? 2 : word.length >= 5 ? 1 : 0);

function fuzzyLabel(raw: string): { key: Key; rest: string } | null {
  const m = raw.match(/^([A-Za-z]+)(?:(\s*[.\-]?\s*)([A-Za-z]+))?/);
  if (!m) return null;
  const candidates = [{ text: m[1].toLowerCase(), used: m[1].length }];
  if (m[3]) candidates.push({ text: (m[1] + m[3]).toLowerCase(), used: m[0].length });
  let best: { key: Key; used: number; dist: number } | null = null;
  for (const c of candidates) {
    if (c.text.length < 3) continue;
    for (const f of FUZZY) {
      if (f.typos?.includes(c.text)) {
        if (!best || 0 < best.dist || c.used > best.used) best = { key: f.key, used: c.used, dist: 0 };
        continue;
      }
      for (const w of f.words) {
        if (c.text.length < 4) continue;
        const dist = editDistance(c.text, w);
        if (dist <= allowedTypos(w) && (!best || dist < best.dist || (dist === best.dist && c.used > best.used))) {
          best = { key: f.key, used: c.used, dist };
        }
      }
    }
  }
  if (!best) return null;
  // The label must be followed by a separator, a space or the end of the line.
  const after = raw.slice(best.used);
  if (after && !/^[\s:：\-–—.=,]/.test(after)) return null;
  let key = best.key;
  let rest = after;
  if (key === 'mobile1') {
    // "Mobil no1 98...", "Mobaile no. 2 - 98..."
    const n = rest.match(/^\s*[.\-:]?\s*(?:no|num|number|nmbr|nbr)?\.?\s*[-:]?\s*(1|2|१|२)(?![0-9])/i);
    if (n) {
      if (n[1] === '2' || n[1] === '२') key = 'mobile2';
      rest = rest.slice(n[0].length);
    }
    // Only a label if a phone number follows (or the number is on the next line).
    if (cleanValue(rest) && !hasNumber(rest)) return null;
  }
  if (key === 'pincode' && cleanValue(rest) && !hasNumber(rest)) return null;
  return { key, rest };
}

/** Single-line fields take only one following line when the label had no value. */
const SINGLE_LINE: Key[] = ['ship_name', 'pincode', 'mobile1', 'mobile2', 'size', 'state', 'district'];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
export function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** Normalise an Indian mobile number to 10 digits, or '' if it isn't one. */
export function normaliseMobile(s: string): string {
  let d = toAsciiDigits(s).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^\d{10}$/.test(d) ? d : ''; // any 10 digits (the shop does not want the 6–9 rule)
}

const MOBILE_RE = /(?<![\d])(?:\+?\s?91[\s-]?|0)?(\d{5})[\s-]?(\d{5})(?![\d])/g;
const PIN_RE = /(?<![\d])([1-9]\d{2})\s?(\d{3})(?![\d])/;

function findMobiles(s: string): string[] {
  const out: string[] = [];
  for (const m of toAsciiDigits(s).matchAll(MOBILE_RE)) out.push(m[1] + m[2]);
  return out;
}

/** A number of 5+ digits (a phone or pincode, right or wrong). */
const hasNumber = (s: string) => /\d{5,}/.test(toAsciiDigits(s).replace(/(?<=\d)[\s-](?=\d)/g, ''));

/** Numbers written after a phone label that are not valid Indian mobiles ("0000000000"),
 *  kept as typed (digits only) so the form shows them in red instead of losing them. */
function rawNumbers(s: string): string[] {
  return toAsciiDigits(s)
    .split(/[,/;|]|\s(?:or|and|&)\s/i)
    .map((x) => x.replace(/\D/g, ''))
    .filter((x) => x.length >= 5);
}

function findPincode(s: string): string {
  // Remove mobile numbers first so their digits are not read as a pincode.
  const t = toAsciiDigits(s).replace(MOBILE_RE, ' ');
  const m = t.match(PIN_RE);
  return m ? m[1] + m[2] : '';
}

const WA_PREFIX = /^\s*\[?\d{1,2}[:.]\d{2}(?:\s?[ap]\.?m\.?)?,?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\]?\s*(?:-\s*)?[^:]{1,40}:\s*/i; // [12:39 pm, 18/10/2026] Name:
const WA_PREFIX2 = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}[:.]\d{2}(?:\s?[ap]\.?m\.?)?\s*-\s*[^:]{1,40}:\s*/i; // 18/10/2026, 12:39 pm - Name:
const TIME_ONLY = /^\s*\d{1,2}[:.]\d{2}\s?(?:[ap]\.?m\.?)?\s*(?:✓+|✔+)?\s*$/i;
const TRAILING_TIME = /\s+\d{1,2}[:.]\d{2}\s?[ap]\.?m\.?\s*(?:✓+|✔+)?\s*$/i;
const NOISE = [
  /^you$/i,
  /^address\s*details?\s*:?$/i,
  /^(?:customer|shipping|delivery)\s*details?\s*:?$/i,
  /^forwarded$/i,
  /^<media omitted>$/i,
  /^this message was deleted$/i,
  /^edited$/i,
  /^(?:today|yesterday)$/i,
  /^(?:hi|hello|ok|okay|thanks?|thank you|namaste|नमस्ते|धन्यवाद)[.! ]*$/i,
  /^(?:to|प्रति)\s*[,:-]?$/i,
];

const AMOUNT_RS = /(?:₹|rs\.?|inr|rupees?)\s*([\d,]+(?:\.\d{1,2})?)/i;
const AMOUNT_WORDS = /^(?:total|amount|amt|cod|price|किंमत|रक्कम)\s*[:\-=]?\s*(?:₹|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?\s*(?:\(.*\))?$/i;
const AMOUNT_BARE = /^\s*(?:₹|rs\.?)?\s*(\d{3,5}|\d{1,2},\d{3})(?:\.\d{1,2})?\s*(?:\/-)?\s*$/i;

function parseAmount(s: string): number | null {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const HINT = /\(\s*near\s*by[^)]*\)|\(\s*nearby[^)]*\)/gi; // "( NEARBY SCHOOL, ROAD , CHOWK )" from the template itself

function cleanValue(v: string): string {
  return v
    .replace(HINT, '')
    .replace(/^[\s:：\-–—.=,>]+/, '')
    .replace(/[\s,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanSize(v: string): string {
  return toAsciiDigits(v)
    .replace(/\b(?:no|number|num|uk|ind|india)\b\.?/gi, ' ')
    .replace(/नंबर|नं\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pincode prefix -> state. Only prefixes that map to one state are listed; others stay empty.
const PIN_STATE_3: Record<string, string> = { '403': 'Goa', '737': 'Sikkim', '744': 'Andaman and Nicobar', '682': 'Kerala', '160': 'Chandigarh' };
const PIN_STATE_2: Record<string, string> = {
  '11': 'Delhi', '12': 'Haryana', '13': 'Haryana', '14': 'Punjab', '15': 'Punjab', '17': 'Himachal Pradesh',
  '18': 'Jammu and Kashmir', '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh', '23': 'Uttar Pradesh',
  '25': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh', '30': 'Rajasthan', '31': 'Rajasthan',
  '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan', '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat',
  '39': 'Gujarat', '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra', '43': 'Maharashtra',
  '44': 'Maharashtra', '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh', '50': 'Telangana', '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka', '60': 'Tamil Nadu', '61': 'Tamil Nadu',
  '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu', '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha', '78': 'Assam', '80': 'Bihar', '82': 'Jharkhand', '83': 'Jharkhand',
  '84': 'Bihar', '85': 'Bihar',
};
export function stateFromPincode(pin: string): string {
  if (!/^[1-9]\d{5}$/.test(pin)) return '';
  return PIN_STATE_3[pin.slice(0, 3)] ?? PIN_STATE_2[pin.slice(0, 2)] ?? '';
}

/** The message split into lines, without WhatsApp time / sender prefixes and bullets. */
function messageLines(text: string): string[] {
  return (text ?? '')
    .replace(/\r/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '') // invisible direction marks WhatsApp adds
    .split('\n')
    .map((l) => l.replace(WA_PREFIX, '').replace(WA_PREFIX2, '').replace(TRAILING_TIME, '').replace(/^[\s*•▪●·]+/, '').trim());
}

const isNoise = (raw: string) => TIME_ONLY.test(raw) || NOISE.some((r) => r.test(raw));

/** "₹1,599.00 (estimated total)", "Total 1599", "1599" -> 1599, otherwise null. */
function amountOf(raw: string, current: Key | null): { amount: number | null } | null {
  const rs = raw.match(AMOUNT_RS);
  if (rs && (/estimated total|total|amount|cod|₹/i.test(raw) || raw.length < 20)) return { amount: parseAmount(rs[1]) };
  const aw = raw.match(AMOUNT_WORDS);
  if (aw) return { amount: parseAmount(aw[1]) };
  if (AMOUNT_BARE.test(raw) && current !== 'size' && current !== 'pincode') return { amount: parseAmount(raw.match(AMOUNT_BARE)![1]) };
  return null;
}

/** Labelled line? Exact label first, then a misspelt one ("Landmmark", "Adress", "Pincod", "Mobil no1"). */
function labelOf(raw: string): { key: Key; rest: string } | null {
  return LABELS.some(({ re }) => re.test(raw)) ? labelOfExact(raw) : fuzzyLabel(raw);
}

/** Exact label. A line that starts like a label but isn't one ("Mobile shop lane") is not a label,
 *  and is then not checked for a misspelt label either. */
function labelOfExact(raw: string): { key: Key; rest: string } | null {
  for (const { key, re } of LABELS) {
    const m = raw.match(re);
    if (m) {
      const rest = raw.slice(m[0].length);
      // "Mobile shop lane" is an address line, not a phone label: keep it so nothing is lost.
      const v = cleanValue(rest);
      // "Mobile shop lane" (no number after it) is an address line, not a phone label.
      if (v && (key === 'mobile1' || key === 'mobile2' || key === 'pincode') && !hasNumber(v)) return null;
      return { key, rest };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
export function parseWhatsApp(text: string): ParseResult {
  const f: Record<Key, string> = {
    ship_name: '', address: '', landmark: '', district: '', state: '', pincode: '', mobile1: '', mobile2: '', size: '',
  };
  let amount: number | null = null;
  const loose: string[] = []; // unlabelled content lines, in order

  const lines = messageLines(text);

  let current: Key | null = null; // label waiting for its value on the next line(s)
  let currentTook = 0;

  const setField = (key: Key, value: string, append: boolean) => {
    if (!value) return;
    if (key === 'mobile1' || key === 'mobile2') {
      let ms = findMobiles(value);
      if (ms.length === 0) ms = rawNumbers(value); // wrong number: keep it, the form marks it red
      if (ms.length === 0) return;
      // A "Mobile" line may hold two numbers: "8106093098 / 9876543210"
      if (key === 'mobile1') {
        f.mobile1 = ms[0];
        if (ms[1] && !f.mobile2) f.mobile2 = ms[1];
      } else {
        f.mobile2 = ms[0];
      }
      return;
    }
    if (key === 'pincode') {
      const p = findPincode(value) || rawNumbers(value)[0] || '';
      if (p) f.pincode = p;
      return;
    }
    if (key === 'size') {
      const s = cleanSize(value);
      if (s) f.size = s;
      return;
    }
    if (append && f[key]) f[key] = `${f[key]}, ${value}`;
    else f[key] = value;
  };

  for (const raw of lines) {
    if (!raw) {
      // A blank line ends a multi-line value.
      current = null;
      continue;
    }
    if (isNoise(raw)) continue;

    // Amount lines: "₹1,599.00 (estimated total)", "Total 1599", "1599"
    const am = amountOf(raw, current);
    if (am) {
      if (amount === null) amount = am.amount;
      continue;
    }

    // "TO, Devidas Shinde" (how labels are often written)
    const to = raw.match(/^to\s*(?:[,:\-]\s*|\s+)(.+)$/i);
    if (to && !f.ship_name) {
      f.ship_name = cleanValue(to[1]);
      current = null;
      continue;
    }

    // Labelled line? Exact label first, then a misspelt one ("Landmmark", "Adress", "Pincod", "Mobil no1").
    let matched = false;
    const hit = labelOf(raw);
    for (const { key, rest } of hit ? [hit] : []) {
      matched = true;
      const value = cleanValue(rest);
      if (value) {
        setField(key, value, false);
        // Address / landmark may continue on the next lines.
        current = SINGLE_LINE.includes(key) ? null : key;
        currentTook = 1;
      } else {
        current = key;
        currentTook = 0;
      }
      break;
    }
    if (matched) continue;

    // Unlabelled line: belongs to the label above it, if any.
    const value = cleanValue(raw);
    if (!value) continue;
    if (current) {
      if (SINGLE_LINE.includes(current)) {
        if (currentTook === 0) {
          setField(current, value, false);
          currentTook = 1;
          current = null;
          continue;
        }
        current = null;
      } else {
        setField(current, value, currentTook > 0);
        currentTook++;
        continue;
      }
    }
    loose.push(value);
  }

  // ------------------------------- Fallbacks -------------------------------
  const guessed: ParsedField[] = [];
  const looseKept: string[] = [];
  for (const l of loose) {
    const mobiles = findMobiles(l);
    const withoutMobiles = toAsciiDigits(l).replace(MOBILE_RE, ' ');
    const pin = findPincode(l);
    // A line that is only numbers (phone / pincode) is not part of the name or address.
    const onlyNumbers = withoutMobiles.replace(PIN_RE, ' ').replace(/[\s,+\-/().:]|pin|code|mob(?:ile)?|no|पिन|कोड/gi, '') === '';
    for (const m of mobiles) {
      if (!f.mobile1) f.mobile1 = m;
      else if (!f.mobile2 && m !== f.mobile1) f.mobile2 = m;
    }
    if (pin && !f.pincode) f.pincode = pin;
    // "10" or "9 no" on its own line = shoe size
    const sz = toAsciiDigits(l).match(/^(\d{1,2}(?:\.5)?)\s*(?:no|number|नंबर|नं)?\.?$/i);
    if (sz) {
      if (!f.size) f.size = sz[1];
      continue;
    }
    if (!onlyNumbers) looseKept.push(l);
  }
  if (!f.ship_name && looseKept.length) {
    f.ship_name = looseKept.shift()!;
  }
  if (!f.address && looseKept.length) {
    f.address = looseKept.join(', ');
  } else if (f.address && looseKept.length) {
    // Extra unlabelled lines after a labelled address (or landmark): keep them, nothing is lost.
    f.address = [f.address, ...looseKept].join(', ');
  }
  // Pincode written inside the address line: "..., Solapur 413255"
  if (!f.pincode) {
    const p = findPincode([f.address, f.landmark].join(' '));
    if (p) f.pincode = p;
  }
  if (!f.state && f.pincode) {
    const s = stateFromPincode(f.pincode);
    if (s) {
      f.state = s;
      guessed.push('state');
    }
  }
  // Phone numbers written inside the address line: "..., Latur Mob 98500 11223"
  if (!f.mobile1 || !f.mobile2) {
    for (const m of findMobiles([f.address, f.landmark].join(' '))) {
      if (!f.mobile1) f.mobile1 = m;
      else if (!f.mobile2 && m !== f.mobile1) f.mobile2 = m;
    }
  }
  if (f.mobile2 === f.mobile1) f.mobile2 = '';
  // The pincode and phones have their own fields: don't repeat them inside the address / landmark.
  f.address = stripContactInfo(f.address, [f.pincode], [f.mobile1, f.mobile2]);
  f.landmark = stripContactInfo(f.landmark, [f.pincode], [f.mobile1, f.mobile2]);

  const filled = (Object.keys(f) as Key[]).filter((k) => f[k]) as ParsedField[];
  if (amount !== null) filled.push('amount');
  const required: ParsedField[] = ['ship_name', 'address', 'pincode', 'mobile1'];
  const missing = required.filter((k) => !f[k as Key]);

  return { ...f, amount, filled, missing, guessed };
}

// ---------------------------------------------------------------------------------------------
// "Not used" check: every line of the pasted message must end up in some field of the form.
// A line with words or numbers that are in no field is returned, so the person saving sees it
// before the label is printed. Labels ("Address -"), chat noise and amount lines are skipped.
// ---------------------------------------------------------------------------------------------
const IGNORE_WORDS = new Set(
  [
    'no', 'nos', 'number', 'num', 'nbr', 'nmbr', 'pin', 'code', 'cod', 'pincode', 'mob', 'mobile', 'ph', 'phone', 'cell', 'contact',
    'uk', 'ind', '91', '0', 'to', 'dist', 'distt', 'district', 'state', 'size', 'landmark', 'address', 'naam', 'name',
    'प्रति', 'नं', 'नंबर', 'क्र', 'पिन', 'कोड', 'पिनकोड', 'मोबाईल', 'मोबाइल', 'फोन', 'जिल्हा', 'जिला', 'राज्य', 'साइज', 'साईज', 'नाव', 'नाम', 'पत्ता', 'पता',
  ].map((w) => w.toLowerCase()),
);
const tokens = (s: string) => toAsciiDigits(s).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

export function findUnused(text: string, fields: Partial<Record<string, string | number | null | undefined>>): string[] {
  const values = Object.values(fields)
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String);
  const known = new Set(values.flatMap(tokens));
  const digits = values.map((v) => toAsciiDigits(v).replace(/\D/g, '')).filter(Boolean).join(' ');
  const out: string[] = [];
  let current: Key | null = null;
  for (const raw of messageLines(text)) {
    if (!raw) {
      current = null;
      continue;
    }
    if (isNoise(raw)) continue;
    if (amountOf(raw, current)) continue;
    let value = raw;
    const to = raw.match(/^to\s*(?:[,:\-]\s*|\s+)(.+)$/i);
    const hit = to ? null : labelOf(raw);
    if (to) value = to[1];
    else if (hit) {
      value = hit.rest;
      current = cleanValue(hit.rest) ? null : hit.key;
      // Phone / pincode / size / name lines: the field has its own box; if it has a value, the person saw it.
      // (A phone line with more numbers than the two phone boxes is still checked.)
      const fits = hit.key === 'mobile1' ? rawNumbers(hit.rest).length <= 2 : rawNumbers(hit.rest).length <= 1;
      if (hit.key !== 'address' && hit.key !== 'landmark' && fits && String(fields[hit.key] ?? '').trim()) continue;
    }
    const missing = tokens(cleanValue(value)).filter((t) => {
      if (IGNORE_WORDS.has(t) || known.has(t)) return false;
      if (/^\d+$/.test(t)) return !digits.includes(t.replace(/^(?:91|0)(?=\d{10}$)/, '')); // 09422… / 919422… = 9422…
      return true;
    });
    if (missing.length) out.push(raw);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Remove a known pincode / mobile number (and the words "Pin code", "पिन कोड", "Mob", "+91" in
// front of it) from free text, so the address does not repeat what is printed on its own line.
// ---------------------------------------------------------------------------------------------
const PIN_WORDS = '(?:(?:pin\\s*-?\\s*code|pincode|pin\\s*no|pin|postal\\s*code|पिन\\s*कोड|पिनकोड|पिन)\\s*[:：\\-.=]?\\s*)?';
const MOB_WORDS =
  '(?:(?:mob(?:ile)?|ph(?:one)?|cell|contact|whats\\s?app|मोबाईल|मोबाइल|फोन|संपर्क)\\.?\\s*(?:no|num|number|नं|नंबर)?\\.?\\s*(?:[12](?![0-9]))?\\s*[:：\\-.=]?\\s*)?';
const spaced = (digits: string) => digits.split('').join('[\\s-]?');

export function stripContactInfo(text: string, pincodes: (string | null | undefined)[], mobiles: (string | null | undefined)[]): string {
  if (!text) return text;
  // Devanagari digit runs → ASCII only where a number could be a pincode / phone
  let t = text.replace(/[०-९][०-९\s-]{4,}[०-९]/g, (m) => toAsciiDigits(m));
  for (const m of mobiles) {
    if (!m || !/^\d{10}$/.test(m)) continue;
    t = t.replace(new RegExp(`${MOB_WORDS}(?<![0-9])(?:\\+?\\s?91[\\s-]?|0)?${spaced(m)}(?![0-9])`, 'gi'), ' ');
  }
  for (const p of pincodes) {
    if (!p || !/^\d{6}$/.test(p)) continue;
    t = t.replace(new RegExp(`${PIN_WORDS}(?<![0-9])${p.slice(0, 3)}\\s?${p.slice(3)}(?![0-9])`, 'gi'), ' ');
  }
  if (t === text) return text;
  return t
    .split('\n')
    .map((l) =>
      l
        .replace(/\s+([,.])/g, '$1')
        .replace(/([,.]\s*){2,}/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,.\-:/]+|[\s,\-:/]+$/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

/** Normalised form used for the duplicate check (server computes sha256 of this). */
export function normaliseForHash(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\[?\b\d{1,2}:\d{2}\s?(?:[ap]\.?m\.?)?,?\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}\]?)?/g, ' ')
    .replace(/\b\d{1,2}\.\d{2}\s?[ap]\.?m\.?/g, ' ')
    .replace(/[✓✔]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
