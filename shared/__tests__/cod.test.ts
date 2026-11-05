// COD: reading booking messages, amount in words, the COD label text. Run: cd server && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codRemainder, findBookingDate, findUnused, findWeight, parseCodMessage, parseWhatsApp, splitSize } from '../parser';
import { COD_FIXED, amountInWords, isIsoDate, numberInWords, printDate } from '../cod';
import { codAmountLine, codHeadLines, codOrderLine, orderLine, toLines, type LabelOrder } from '../label';

// ------------------------------------------------------------------ amount in words
test('amount in words (Indian system, as printed on the COD label)', () => {
  assert.equal(numberInWords(1299), 'One Thousand Two Hundred Ninety Nine');
  assert.equal(numberInWords(100000), 'One Lakh');
  assert.equal(numberInWords(125050), 'One Lakh Twenty Five Thousand Fifty');
  assert.equal(numberInWords(10_00_00_000), 'Ten Crore');
  assert.equal(amountInWords(1999), 'ONE THOUSAND NINE HUNDRED NINETY NINE ONLY');
  assert.equal(amountInWords(850), 'EIGHT HUNDRED FIFTY ONLY');
  assert.equal(amountInWords(2500), 'TWO THOUSAND FIVE HUNDRED ONLY');
  assert.equal(amountInWords(1999.5), 'ONE THOUSAND NINE HUNDRED NINETY NINE AND FIFTY PAISE ONLY');
  assert.equal(amountInWords(null), '');
  assert.equal(amountInWords(0), '');
});

test('dates', () => {
  assert.equal(printDate('2026-11-03'), '03/11/2026');
  assert.equal(printDate(null), '');
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.equal(findBookingDate('Booking Date: 02/11/2026')?.iso, '2026-11-02');
  assert.equal(findBookingDate('Date - 2-11-26')?.iso, '2026-11-02');
  assert.equal(findBookingDate('Dt. 3 Nov 2026')?.iso, '2026-11-03');
  assert.equal(findBookingDate('booking dt 2026-11-05')?.iso, '2026-11-05');
  assert.equal(findBookingDate('Booking date 31/02/2026'), null, 'not a real date');
  assert.equal(findBookingDate('Update 2/11'), null, '"date" inside a word');
});

test('weights', () => {
  assert.equal(findWeight('Weight: 800 gm')?.weight, '800 g');
  assert.equal(findWeight('Wt 1.2kg')?.weight, '1.2 kg');
  assert.equal(findWeight('Weight - 750')?.weight, '750 g');
  assert.equal(findWeight('weight 2')?.weight, '2 kg');
  assert.equal(findWeight('Wt. 500 grams')?.weight, '500 g');
  assert.equal(findWeight('Swt road'), null);
});

test('size + description', () => {
  assert.deepEqual(splitSize('8 pona sanke awaj'), { size: '8', note: 'pona sanke awaj' });
  assert.deepEqual(splitSize('9 no, black kolhapuri'), { size: '9', note: 'black kolhapuri' });
  assert.deepEqual(splitSize('10'), { size: '10', note: '' });
  assert.deepEqual(splitSize('7.5'), { size: '7.5', note: '' });
  assert.deepEqual(splitSize('UK 8'), { size: 'UK 8', note: '' });
});

// ------------------------------------------------------------------ COD messages
// The customer's WhatsApp template (as on the shop's real COD label of 2 Nov 2026)
const WA = `Naam - vijay shivaji ingale
Address =37mld plant afgan charch nanabhai moos marg nevy nagar colaba Mumbai - 400005
Landmark ( NEARBY SCHOOL, ROAD , CHOWK )
State Maharashtra
Pincode -400005
Mobile No 1.7888252371
Mobile no 2.8421605771
Size 8 pona sanke awaj
COD 1999`;

test('WhatsApp order: customer, COD amount, size + description', () => {
  const p = parseCodMessage(WA);
  assert.equal(p.ship_name, 'vijay shivaji ingale');
  assert.match(p.address, /^37mld plant afgan charch nanabhai moos marg nevy nagar colaba Mumbai/);
  assert.equal(p.pincode, '400005');
  assert.equal(p.state, 'Maharashtra');
  assert.equal(p.mobile1, '7888252371');
  assert.equal(p.mobile2, '8421605771');
  assert.equal(p.amount, 1999);
  assert.equal(p.size, '8');
  assert.equal(p.note, 'pona sanke awaj');
  assert.deepEqual(p.missing, []);
  assert.deepEqual(findUnused(codRemainder(WA), p as any), []);
});

test('bare amount line ("1999") is the COD amount too', () => {
  const p = parseCodMessage(WA.replace('COD 1999', '1999'));
  assert.equal(p.amount, 1999);
});

test('the text of an old printed COD label (header, From block) is read correctly', () => {
  const label = `Booking Under Pune City West Division
Customer ID : 1634841966, Contract ID – 41282773
BNPL HUB Pune 411001, Weight :      Date :  02/11/2026
COD FOR RUPEES : 1999/-( ONE THOUSAND nine Hundred ninety NINE only)

TO, vijay shivaji ingale
Address =37mld plant afgan charch nanabhai moos marg nevy nagar colaba Mumbai - 400005
Landmark ( NEARBY SCHOOL, ROAD , CHOWK )
State Maharashtra
Pincode -400005
Mobile No 1.7888252371
Mobile no 2.8421605771

COD 1999 (Size 8 pona sanke awaj)

From :-
PRASAD SHOES
1306, shukrawar Peth
Nr. BSNL office, Pune 411002.
Mob. 7020861805, 9270063067.`;
  const p = parseCodMessage(label);
  assert.equal(p.ship_name, 'vijay shivaji ingale');
  assert.equal(p.amount, 1999);
  assert.equal(p.booking_date, '2026-11-02');
  assert.equal(p.size, '8');
  assert.equal(p.note, 'pona sanke awaj');
  assert.equal(p.mobile1, '7888252371');
  assert.equal(p.mobile2, '8421605771');
  // the shop's own From block and the fixed IDs never reach the receiver
  const all = JSON.stringify(p);
  for (const v of [COD_FIXED.customerId, COD_FIXED.contractId, '7020861805', 'BSNL', 'BNPL', 'PRASAD']) assert.ok(!all.includes(v), `${v} leaked`);
  assert.deepEqual(findUnused(codRemainder(label), p as any), []);
});

test('Marathi labels, weight + date in the message', () => {
  const p = parseCodMessage(`नाव - सुनील जाधव
पत्ता - मु. पो. कोंडी, ता. उत्तर सोलापूर
पिन कोड 413255
मोबाईल 7276052601
साइज 9
COD 1599
वजन 1 kg
Booking date 03/11/2026`);
  assert.equal(p.ship_name, 'सुनील जाधव');
  assert.equal(p.pincode, '413255');
  assert.equal(p.mobile1, '7276052601');
  assert.equal(p.amount, 1599);
  assert.equal(p.weight, '1 kg');
  assert.equal(p.booking_date, '2026-11-03');
  assert.equal(p.size, '9');
  assert.equal(p.note, '');
});

test('missing amount is reported (COD needs one)', () => {
  const p = parseCodMessage('To, Ramesh\nKarad 415110\n9876543210');
  assert.equal(p.amount, null);
  assert.ok(p.missing.includes('amount'));
});

test('Prepaid reading is unchanged by the COD reader', () => {
  const a = parseWhatsApp(WA);
  assert.equal(a.size, '8', 'Size = only the number');
  assert.equal(a.note, 'pona sanke awaj', 'the words stay in Note as written');
  assert.equal(a.ship_name, 'vijay shivaji ingale');
});

// ------------------------------------------------------------------ COD label text
const cod: LabelOrder = {
  ship_name: 'vijay shivaji ingale',
  address: '37mld plant afgan charch nanabhai moos marg nevy nagar colaba Mumbai - 400005',
  state: 'Maharashtra',
  pincode: '400005',
  mobile1: '7888252371',
  mobile2: '8421605771',
  size: '8',
  note: 'pona sanke awaj',
  payment_type: 'COD',
  amount: 1999,
  booking_date: '2026-11-02',
  weight: null,
};

test('COD header: fixed details, BNPL HUB + weight + date, amount in figures and words', () => {
  assert.deepEqual(codHeadLines(cod), [
    'Booking Under Pune City West Division',
    'Customer ID : 1634841966, Contract ID – 41282773',
    'BNPL HUB Pune 411001, Weight : ________    Date : 02/11/2026',
    'COD FOR RUPEES : 1999/-ONE THOUSAND NINE HUNDRED NINETY NINE ONLY',
  ]);
  assert.equal(codHeadLines({ ...cod, weight: '800 g' })[2], 'BNPL HUB Pune 411001, Weight : 800 g    Date : 02/11/2026');
  assert.equal(codAmountLine({ ...cod, amount: 2450 }), 'COD FOR RUPEES : 2450/-TWO THOUSAND FOUR HUNDRED FIFTY ONLY');
});

test('COD line after the address uses the real amount, size and description', () => {
  assert.equal(codOrderLine(cod), 'COD 1999 (Size 8 pona sanke awaj)');
  assert.equal(codOrderLine({ ...cod, amount: 1299, size: '10', note: null }), 'COD 1299 (Size 10)');
  assert.equal(codOrderLine({ ...cod, product_name: 'Kolhapuri', size: '9', note: 'RED' }), 'COD 1999 (Kolhapuri, Size 9 RED)');
  assert.equal(codOrderLine({ ...cod, size: null, note: null }), 'COD 1999');
  // the receiver block is the same as on a Prepaid label
  assert.deepEqual(toLines(cod), [
    '37mld plant afgan charch nanabhai moos marg nevy nagar colaba Mumbai',
    'Maharashtra',
    'Mob. 7888252371, 8421605771',
    'Pin code 400005',
  ]);
});

test('Prepaid label: the amount prints last when filled, once', () => {
  const pre: LabelOrder = { ...cod, payment_type: 'PREPAID', product_name: 'Kolhapuri', size: '9', note: 'RED', booking_date: null };
  assert.equal(orderLine({ ...pre, amount: null }), 'PREPAID (Kolhapuri, 9 no, RED)');
  assert.equal(orderLine(pre), 'PREPAID (Kolhapuri, 9 no, RED, 1999)');
  assert.equal(orderLine({ ...pre, product_name: 'red capsi', note: null, amount: 1299 }), 'PREPAID (red capsi, 9 no, 1299)');
  // the price already written in the Note: not printed again
  assert.equal(orderLine({ ...pre, product_name: null, note: '4veni 999+sol', amount: 999 }), 'PREPAID (9 no, 4veni 999+sol)');
  assert.equal(orderLine({ ...pre, product_name: null, size: null, note: null, amount: 1500 }), 'PREPAID (1500)');
  assert.equal(orderLine({ ...pre, product_name: null, size: null, note: null, amount: null }), 'PREPAID');
});

test('real COD message: "Mo." is Mobile, a state line goes to State, landmark on two lines joins with a space', () => {
  const msg = `Sumit Dwivedi\nVillage Name Sumit Dwivedi Durgagunj Bilgram Hardoi\nPincode- 241301\nLandmark- Radha Krishna\nMandir\nUttar Pradesh\nMo. 9119654901, 9112582108\n\nCOD 1999 (Size- 8 Sankeswari awaj With Naal)`;
  const r = parseCodMessage(msg);
  assert.equal(r.landmark, 'Radha Krishna Mandir');
  assert.equal(r.state, 'Uttar Pradesh');
  assert.equal(r.mobile1, '9119654901');
  assert.equal(r.mobile2, '9112582108');
  assert.equal(r.address, 'Village Name Sumit Dwivedi Durgagunj Bilgram Hardoi');
  assert.equal(r.amount, 1999);
  assert.equal(r.size, '8');
  assert.equal(r.note, 'Sankeswari awaj With Naal');
});

test('"Mohalla" / "Mohan Nagar" stay in the address (Mo. needs a number after it)', () => {
  const r = parseWhatsApp(`Ramesh Patil\nMohalla Peth, Mohan Nagar\nLatur 413512\n9850011223`);
  assert.equal(r.address, 'Mohalla Peth, Mohan Nagar, Latur');
  assert.equal(r.mobile1, '9850011223');
});

test('nothing printed twice: Note words already in Product name are left out', () => {
  const o = { ...cod, amount: 1999, size: '8' };
  assert.equal(codOrderLine({ ...o, product_name: null, note: 'Sankeswari awaj With Naal' }), 'COD 1999 (Size 8 Sankeswari awaj With Naal)');
  assert.equal(codOrderLine({ ...o, product_name: 'Sankeswari awaj With Naal', note: 'Sankeswari awaj With Naal' }), 'COD 1999 (Sankeswari awaj With Naal, Size 8)');
  assert.equal(codOrderLine({ ...o, product_name: 'Sankeswari', note: 'Sankeswari awaj With Naal' }), 'COD 1999 (Sankeswari, Size 8 awaj With Naal)');
  assert.equal(codOrderLine({ ...o, product_name: 'Kolhapuri', note: 'RED' }), 'COD 1999 (Kolhapuri, Size 8 RED)');
  assert.equal(orderLine({ ...o, payment_type: 'PREPAID', product_name: 'black shahu', size: '11', note: 'Black Shahu' }), 'PREPAID (black shahu, 11 no, 1999)');
});

test('"Product: …" / "Product name - …" lines fill Product name, not the address', () => {
  const base = `Sumit Dwivedi\nDurgagunj Bilgram Hardoi\nPincode- 241301\nMo. 9119654901\n`;
  let r = parseCodMessage(base + 'Product: Sankeswari\nCOD 1999 (Size 8)');
  assert.deepEqual([r.product_name, r.size, r.amount, r.address], ['Sankeswari', '8', 1999, 'Durgagunj Bilgram Hardoi']);
  r = parseCodMessage(base + 'Product name - Kolhapuri Kurundwad\nCOD 1499 (Size 9)');
  assert.deepEqual([r.product_name, r.size, r.amount], ['Kolhapuri Kurundwad', '9', 1499]);
  // not in the message = left empty
  r = parseCodMessage(base + 'COD 1999');
  assert.deepEqual([r.product_name, r.size, r.note], ['', '', '']);
  assert.deepEqual(findUnused(codRemainder(base + 'Product: Sankeswari\nCOD 1999'), parseCodMessage(base + 'Product: Sankeswari\nCOD 1999') as never), []);
});

test('Prepaid amount: typed by hand prints last; a price from the pasted message is never added again', () => {
  const o: LabelOrder = { ...cod, payment_type: 'PREPAID', product_name: 'red capsi', size: '9', note: null, amount: 1299 };
  assert.equal(orderLine(o), 'PREPAID (red capsi, 9 no, 1299)');
  assert.equal(orderLine({ ...o, product_name: null, note: '4veni 999+sol', amount: 999 }), 'PREPAID (9 no, 4veni 999+sol)');
  assert.equal(orderLine({ ...o, raw_message: 'Ramesh\n₹1,599.00 (estimated total)', amount: 1599 }), 'PREPAID (red capsi, 9 no)');
  assert.equal(orderLine({ ...o, raw_message: 'Ramesh\nLatur 413512', amount: 1299 }), 'PREPAID (red capsi, 9 no, 1299)');
});

test('real COD messages: size + note without brackets; two "Mobile no-" lines = Mobile 1 and Mobile 2', () => {
  const a = `Name-Dhonde Ajay Ram\nAddress-Khasbag gali Ashti tal-Ashti Dist-Beed\nLandmark-khadkat chowk\nState-Maharashtra\nPincode-414203\nMobile no-9767239595\nMobile no-8830589798\n\nCOD 1299 Size-7 no sanke`;
  const r = parseCodMessage(a);
  assert.deepEqual([r.amount, r.size, r.note, r.mobile1, r.mobile2], [1299, '7', 'sanke', '9767239595', '8830589798']);
  assert.equal(codOrderLine({ ...cod, ...r, payment_type: 'COD' }), 'COD 1299 (Size 7 sanke)');
  const b = `GUDDU BAGHEL (Pithli)\nAddress  CHHATTISGARH BASTAR DISTRICT  GAON - RAJNAGAR   KOTWAR PARA\nLandmark RAJNAGAR KOTWAR PARA\nState Chhattisgarh\nPincode -494222\nMobile No 1.  9098415637\nMobile no 2. 7724962813\n\nCOD 1599 (Size - 6 kd awaj)`;
  const q = parseCodMessage(b);
  assert.deepEqual([q.amount, q.size, q.note, q.mobile1, q.mobile2], [1599, '6', 'kd awaj', '9098415637', '7724962813']);
  assert.equal(codOrderLine({ ...cod, ...q, payment_type: 'COD' }), 'COD 1599 (Size 6 kd awaj)');
});

test('a phone number that is not in the form is shown as not used', () => {
  const text = `Ramesh Patil\nShivaji Chowk, Latur\nPincode 413512\nMobile no-9767239595`;
  const form = { ...parseWhatsApp(text), mobile1: '8830589798' };
  assert.deepEqual(findUnused(text, form as never), ['Mobile no-9767239595']);
});
