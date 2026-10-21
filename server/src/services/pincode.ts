// Checks a pincode against the official India Post list (server/data/pincodes.json) and compares it
// with what the customer wrote, so a wrong pincode is seen before the parcel is shipped.
//
//   - pincode not in the list            -> red warning (the list may miss a very new pincode, so
//                                           it is a warning, never a block)
//   - district and state for the pincode -> returned, so the app can fill empty fields
//   - address names another district     -> flag only, no note (the shop asked for no orange note);
//                                           the app then does not add the pincode's district
//
// Nothing here blocks saving. The person saving sees the warnings and decides.
import fs from 'node:fs';
import path from 'node:path';

export interface PinWarning {
  level: 'danger' | 'warn';
  field: 'pincode' | 'address' | 'district' | 'state';
  text: string;
}

export interface PinCheck {
  pincode: string;
  found: boolean;
  /** District(s) of this pincode, e.g. ["Solapur"]. Empty when not found. */
  districts: string[];
  /** State of this pincode, e.g. "Maharashtra". Empty when not found. */
  state: string;
  /** Only "pincode not in the India Post list" (red). */
  warnings: PinWarning[];
  /** The address / district field names another district than the pincode's (no note shown). */
  addressNamesOtherDistrict: boolean;
  /** The District / State fields do not match this pincode: the app asks before changing them. */
  mismatch: { district?: { typed: string; pincode: string; inAddress?: boolean }; state?: { typed: string; pincode: string } };
}

export interface PinCheckInput {
  pincode: string;
  address?: string | null;
  landmark?: string | null;
  district?: string | null;
  state?: string | null;
}

interface PinRow {
  districts: string[]; // upper case, as in the list
  states: string[];
  offices: string[]; // normalised post office names
}

// ------------------------------------------------------------------ text helpers
/** Lower-case words (any script), joined by single spaces. */
export function words(s: string | null | undefined): string {
  return ((s ?? '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).join(' ');
}

const SMALL = new Set(['and', 'of', 'the']);
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join('')
    .replace(/\(([a-z])/g, (_, c) => `(${c.toUpperCase()})`);
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** "BENGALURU URBAN" -> "bengaluru", "KAIMUR (BHABUA)" -> "kaimur", "EAST DISTRICT" -> "east". */
function districtKey(name: string): string {
  return words(name.replace(/\(.*?\)/g, ' '))
    .replace(/\b(?:district|suburban|urban|rural)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// District names that are also everyday words, person names or directions: never treated as a
// mention of that district inside an address (too many false warnings).
const NOT_A_MENTION = new Set(
  (
    'north south east west central middle north east north west south west anand sagar pali una mau mon nuh diu dhar guna kota ' +
    'mandi dang puri patan samba korea gaya banda mansa nadia basti panna saran kheri kheda siang sidhi lohit mahe daman boudh ' +
    'arwal noney kamle peren mamit tirap yanam phek wokha hills'
  ).split(' '),
);
// "Pune road", "Nagar highway", "Satara naka": a road name, not where the customer lives.
const ROAD_WORDS = new Set(
  'road rd highway hwy naka chowk gate phata bypass marg path peth colony station stand darwaja vesh wes ves line lane bus depot'.split(' '),
);

// New and old names of the same district, and common other spellings / Marathi names.
const ALIASES: Record<string, string[]> = {
  aurangabad: ['chhatrapati sambhajinagar', 'sambhajinagar', 'chh sambhajinagar', 'औरंगाबाद', 'छत्रपती संभाजीनगर', 'संभाजीनगर'],
  osmanabad: ['dharashiv', 'उस्मानाबाद', 'धाराशिव'],
  ahmednagar: ['ahilyanagar', 'ahmadnagar', 'अहमदनगर', 'अहिल्यानगर'],
  buldhana: ['buldana', 'बुलढाणा', 'बुलडाणा'],
  gondia: ['gondiya', 'गोंदिया'],
  nashik: ['nasik', 'नाशिक'],
  solapur: ['sholapur', 'सोलापूर', 'सोलापुर'],
  mumbai: ['bombay', 'मुंबई'],
  pune: ['poona', 'पुणे'],
  bengaluru: ['bangalore'],
  mysuru: ['mysore'],
  belagavi: ['belgaum'],
  kalaburagi: ['gulbarga'],
  vijayapura: ['bijapur'],
  shivamogga: ['shimoga'],
  tumakuru: ['tumkur'],
  prayagraj: ['allahabad'],
  ayodhya: ['faizabad'],
  gurugram: ['gurgaon'],
  thiruvananthapuram: ['trivandrum'],
  kolkata: ['calcutta'],
  chennai: ['madras'],
  vadodara: ['baroda'],
  akola: ['अकोला'],
  amravati: ['अमरावती'],
  beed: ['बीड'],
  bhandara: ['भंडारा'],
  chandrapur: ['चंद्रपूर'],
  dhule: ['धुळे'],
  gadchiroli: ['गडचिरोली'],
  hingoli: ['हिंगोली'],
  jalgaon: ['जळगाव'],
  jalna: ['जालना'],
  kolhapur: ['कोल्हापूर', 'कोल्हापुर'],
  latur: ['लातूर', 'लातुर'],
  nagpur: ['नागपूर', 'नागपुर'],
  nanded: ['नांदेड'],
  nandurbar: ['नंदुरबार'],
  palghar: ['पालघर'],
  parbhani: ['परभणी'],
  raigad: ['रायगड'],
  ratnagiri: ['रत्नागिरी'],
  sangli: ['सांगली'],
  satara: ['सातारा'],
  sindhudurg: ['सिंधुदुर्ग'],
  thane: ['ठाणे'],
  wardha: ['वर्धा'],
  washim: ['वाशिम'],
  yavatmal: ['यवतमाळ'],
};

const STATE_ALIASES: Record<string, string[]> = {
  MAHARASHTRA: ['mh', 'maharastra', 'महाराष्ट्र'],
  'UTTAR PRADESH': ['up', 'उत्तर प्रदेश'],
  'MADHYA PRADESH': ['mp', 'मध्य प्रदेश'],
  'ANDHRA PRADESH': ['ap'],
  'TAMIL NADU': ['tn'],
  'WEST BENGAL': ['wb'],
  KARNATAKA: ['कर्नाटक'],
  GUJARAT: ['गुजरात'],
  RAJASTHAN: ['राजस्थान'],
  BIHAR: ['बिहार'],
  TELANGANA: ['तेलंगाना', 'telangna'],
  GOA: ['गोवा'],
  DELHI: ['new delhi', 'दिल्ली'],
  ODISHA: ['orissa'],
  PUDUCHERRY: ['pondicherry'],
  UTTARAKHAND: ['uttaranchal'],
  'JAMMU AND KASHMIR': ['j k', 'jammu kashmir', 'jammu   kashmir'],
  CHHATTISGARH: ['chattisgarh', 'छत्तीसगढ़'],
};

// ------------------------------------------------------------------ the list
interface Index {
  pins: Map<string, PinRow>;
  /** mention key ("satara", "सातारा", "bangalore") -> district names it stands for */
  keys: Map<string, Set<string>>;
  /** key length order, longest first, so "mumbai suburban" wins over "mumbai" */
  keyList: string[];
  /** district name -> normalised post office names in that district */
  districtOffices: Map<string, Set<string>>;
  /** normalised state text -> state name */
  states: Map<string, string>;
}

let index: Index | null = null;

function dataFile(): string {
  const candidates = [
    process.env.PINCODE_FILE,
    path.join(__dirname, '..', 'data', 'pincodes.json'), // dist/index.js
    path.join(__dirname, '..', '..', 'data', 'pincodes.json'), // src/services/pincode.ts (dev)
  ].filter((p): p is string => !!p);
  const f = candidates.find((p) => fs.existsSync(p));
  if (!f) throw new Error(`Pincode list not found (looked in ${candidates.join(', ')})`);
  return f;
}

function load(): Index {
  if (index) return index;
  const raw = JSON.parse(fs.readFileSync(dataFile(), 'utf8')) as { pins: Record<string, [string, string, string]> };
  const pins = new Map<string, PinRow>();
  const keys = new Map<string, Set<string>>();
  const districtOffices = new Map<string, Set<string>>();
  const allStates = new Set<string>();
  const addKey = (k: string, district: string) => {
    if (!k || k.replace(/\s/g, '').length < 4 || NOT_A_MENTION.has(k)) return;
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k)!.add(district);
  };
  for (const [pin, [d, s, o]] of Object.entries(raw.pins)) {
    const row: PinRow = {
      districts: d ? d.split('|') : [],
      states: s ? s.split('|') : [],
      offices: o ? o.split('|').map(words).filter((x) => x.replace(/\s/g, '').length >= 4) : [],
    };
    pins.set(pin, row);
    for (const st of row.states) allStates.add(st);
    for (const dist of row.districts) {
      addKey(districtKey(dist), dist);
      if (!districtOffices.has(dist)) districtOffices.set(dist, new Set());
      const set = districtOffices.get(dist)!;
      for (const off of row.offices) set.add(off);
    }
  }
  for (const [main, others] of Object.entries(ALIASES)) {
    const ds = keys.get(main);
    if (!ds) continue;
    for (const a of others) for (const dist of ds) addKey(words(a), dist);
  }
  const states = new Map<string, string>();
  for (const st of allStates) states.set(words(st), st);
  for (const [st, al] of Object.entries(STATE_ALIASES)) for (const a of al) states.set(words(a), st);
  index = { pins, keys, keyList: [...keys.keys()].sort((a, b) => b.length - a.length), districtOffices, states };
  return index;
}

/** Load the list now (at server start) instead of on the first request. */
export function preloadPincodes(): number {
  return load().pins.size;
}

function stateOf(text: string): string | null {
  const ix = load();
  const t = words(text);
  if (!t) return null;
  if (ix.states.has(t)) return ix.states.get(t)!;
  // Typos: "Maharashtr", "Karnatka"
  let best: { st: string; d: number } | null = null;
  for (const [k, st] of ix.states) {
    if (k.length < 5) continue;
    const d = editDistance(t, k);
    if (d <= (k.length >= 8 ? 2 : 1) && (!best || d < best.d)) best = { st, d };
  }
  return best?.st ?? null;
}

/** Which district keys occur as whole words in the text (road names left out). */
function mentions(text: string): string[] {
  const ix = load();
  const t = ` ${text} `;
  const found: string[] = [];
  let rest = t;
  for (const k of ix.keyList) {
    const needle = ` ${k} `;
    let at = rest.indexOf(needle);
    while (at >= 0) {
      const after = rest.slice(at + needle.length).split(' ')[0];
      if (!ROAD_WORDS.has(after)) {
        found.push(k);
        // blank it out so "mumbai" is not found again inside "mumbai suburban"
        rest = rest.slice(0, at) + ' '.repeat(needle.length) + rest.slice(at + needle.length);
        break;
      }
      at = rest.indexOf(needle, at + 1);
    }
  }
  return found;
}

const hasWords = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

// ------------------------------------------------------------------ main check
export function checkPincode(input: PinCheckInput): PinCheck {
  const ix = load();
  const pincode = (input.pincode ?? '').replace(/\s/g, '');
  const out: PinCheck = { pincode, found: false, districts: [], state: '', warnings: [], addressNamesOtherDistrict: false, mismatch: {} };
  if (!/^[1-9]\d{5}$/.test(pincode)) return out;

  const row = ix.pins.get(pincode);
  if (!row) {
    out.warnings.push({
      level: 'danger',
      field: 'pincode',
      text: `Pincode ${pincode} is not in the India Post list. Check the number with the customer.`,
    });
    return out;
  }
  out.found = true;
  out.districts = row.districts.map(titleCase);
  out.state = row.states.map(titleCase)[0] ?? '';
  const pinDistricts = new Set(row.districts);
  const districtText = out.districts.join(' / ');
  // Places that belong to this pincode's district(s): a village with the same name as another district is fine.
  const nearby = new Set<string>();
  for (const d of row.districts) for (const o of ix.districtOffices.get(d) ?? []) nearby.add(o);

  // The address names a different district (e.g. "Udgir, Latur" with a pincode of Osmanabad)?
  // No note is shown for this (the shop does not want it); it only stops the app from adding the
  // pincode's district to a label where the customer wrote another one.
  const text = words([input.address, input.landmark, input.district].filter(Boolean).join(' '));
  const ms = mentions(text);
  const own = ms.some((k) => [...ix.keys.get(k)!].some((d) => pinDistricts.has(d)));
  const officeSeen = row.offices.some((o) => hasWords(text, o));
  const foreign = ms.filter((k) => ![...ix.keys.get(k)!].some((d) => pinDistricts.has(d)) && !nearby.has(k));
  out.addressNamesOtherDistrict = foreign.length > 0 && !own && !officeSeen;

  // District field: matches when it names this pincode's district (any spelling / old or Marathi name).
  const dTyped = (input.district ?? '').trim();
  if (dTyped && out.districts.length === 1) {
    const dw = words(dTyped);
    const keys = [...mentions(dw), districtKey(dTyped)].filter((k) => ix.keys.has(k));
    const ok = keys.some((k) => [...ix.keys.get(k)!].some((d) => pinDistricts.has(d)));
    if (!ok) out.mismatch.district = { typed: dTyped, pincode: out.districts[0] };
  } else if (!dTyped && out.addressNamesOtherDistrict && out.districts.length === 1) {
    // No District field, but the address names another district ("..., Udgir, Latur" with an Osmanabad pincode).
    out.mismatch.district = { typed: titleCase([...ix.keys.get(foreign[0])!][0]), pincode: out.districts[0], inAddress: true };
  }
  // State field: matches when it is this pincode's state (typos, short forms and Marathi / Hindi names allowed).
  const sTyped = (input.state ?? '').trim();
  if (sTyped && out.state) {
    const st = stateOf(sTyped);
    if (!st || !row.states.includes(st)) out.mismatch.state = { typed: sTyped, pincode: out.state };
  }
  return out;
}
