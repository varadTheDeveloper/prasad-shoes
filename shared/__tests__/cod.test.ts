// COD: reading booking messages, amount in words, the COD label text. Run: cd server && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codRemainder, findBookingDate, findUnused, findWeight, parseCodMessage, parseWhatsApp, splitSize } from '../parser';
import { COD_FIXED, amountInWords, isIsoDate, numberInWords, printDate } from '../cod';
import { codAmountLine, codHeadLines, codOrderLine, headLines, labelOrderLine, orderLine, toLines, type LabelOrder } from '../label';

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
  assert.equal(p.note, 'Size 8 pona sanke awaj'); // the size line as written
  assert.equal(codOrderLine({ ...cod, ...p, payment_type: 'COD' }), 'COD 1999 (Size 8 pona sanke awaj)');
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
  assert.equal(p.note, 'Size 8 pona sanke awaj'); // after the COD amount: as written ("( ONE THOUSAND … only)" is not a note)
  assert.equal(codOrderLine({ ...cod, ...p, payment_type: 'COD' }), 'COD 1999 (Size 8 pona sanke awaj)');
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
  assert.equal(a.note, 'Size 8 pona sanke awaj', 'the size line stays in Note as written');
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
  assert.equal(r.note, 'Size- 8 Sankeswari awaj With Naal'); // as written
  assert.equal(codOrderLine({ ...cod, ...r, payment_type: 'COD' }), 'COD 1999 (Size- 8 Sankeswari awaj With Naal)');
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
  assert.deepEqual([r.amount, r.size, r.note, r.mobile1, r.mobile2], [1299, '7', 'Size-7 no sanke', '9767239595', '8830589798']);
  assert.equal(codOrderLine({ ...cod, ...r, payment_type: 'COD' }), 'COD 1299 (Size-7 no sanke)');
  const b = `GUDDU BAGHEL (Pithli)\nAddress  CHHATTISGARH BASTAR DISTRICT  GAON - RAJNAGAR   KOTWAR PARA\nLandmark RAJNAGAR KOTWAR PARA\nState Chhattisgarh\nPincode -494222\nMobile No 1.  9098415637\nMobile no 2. 7724962813\n\nCOD 1599 (Size - 6 kd awaj)`;
  const q = parseCodMessage(b);
  assert.deepEqual([q.amount, q.size, q.note, q.mobile1, q.mobile2], [1599, '6', 'Size - 6 kd awaj', '9098415637', '7724962813']);
  assert.equal(codOrderLine({ ...cod, ...q, payment_type: 'COD' }), 'COD 1599 (Size - 6 kd awaj)');
  // anything after the amount is kept as written, with or without the word Size
  const c = parseCodMessage(b.replace('COD 1599 (Size - 6 kd awaj)', 'COD 1599 kd awaj 6 no'));
  assert.equal(codOrderLine({ ...cod, ...c, payment_type: 'COD' }), 'COD 1599 (kd awaj 6 no)');
});

test('a phone number that is not in the form is shown as not used', () => {
  const text = `Ramesh Patil\nShivaji Chowk, Latur\nPincode 413512\nMobile no-9767239595`;
  const form = { ...parseWhatsApp(text), mobile1: '8830589798' };
  assert.deepEqual(findUnused(text, form as never), ['Mobile no-9767239595']);
});

test('pasted note prints alone (nothing added from Size / Product / Amount); typed note: the typed fields print', () => {
  const m = `sujay bhoir\nAddress -dhaniv baug,jadhavpada, nallasopara east, omkar hardwear\nLandmark ( NEARBY MOTHER BEAKRY)\nState -MAHARASHTRA\nPincode -401208\nMobile No 1.9637602214\nMobile no 2.8237489180\n\nCOD 1799 (10 no Lokare shahu awaj)`;
  const r = parseCodMessage(m);
  assert.equal(r.landmark, '( NEARBY MOTHER BEAKRY)'); // a real landmark, not the template hint
  assert.deepEqual([r.size, r.note, r.amount], ['10', '10 no Lokare shahu awaj', 1799]);
  const o = { ...cod, ...r, payment_type: 'COD' as const, raw_message: m };
  assert.equal(codOrderLine(o), 'COD 1799 (10 no Lokare shahu awaj)');
  assert.equal(codOrderLine({ ...o, product_name: 'Lokare' }), 'COD 1799 (10 no Lokare shahu awaj)');
  // Prepaid with a pasted note: the note only, no "9 no", no product, no amount
  const p = `Ramesh\nLatur 413512\n9850011223\nSize 9 4veni 999+sol`;
  assert.equal(orderLine({ ...cod, payment_type: 'PREPAID', size: '9', note: 'Size 9 4veni 999+sol', product_name: 'kolhapuri', amount: 1299, raw_message: p }), 'PREPAID (Size 9 4veni 999+sol)');
  // nothing pasted for the note: the typed fields print
  assert.equal(orderLine({ ...cod, payment_type: 'PREPAID', size: '9', note: 'red', product_name: 'red capsi', amount: 1299, raw_message: '' }), 'PREPAID (red capsi, 9 no, 1299)');
  assert.equal(codOrderLine({ ...cod, size: '9', note: null, product_name: 'red capsi', amount: 1299, raw_message: 'Ramesh\nLatur' }), 'COD 1299 (red capsi, Size 9)');
});

test('Prepaid labels start with the first 3 COD header lines (never "COD FOR RUPEES"); date falls back to the order date', () => {
  const pre: LabelOrder = { ...cod, payment_type: 'PREPAID', amount: 1299, booking_date: null, weight: null, created_date: '2026-11-15' };
  assert.deepEqual(headLines(pre), [
    'Booking Under Pune City West Division',
    'Customer ID : 1634841966, Contract ID – 41282773',
    'BNPL HUB Pune 411001, Weight : ________    Date : 15/11/2026',
  ]);
  assert.equal(headLines({ ...pre, weight: '800 g', booking_date: '2026-11-16' })[2], 'BNPL HUB Pune 411001, Weight : 800 g    Date : 16/11/2026');
  assert.equal(headLines({ ...cod, payment_type: 'COD' }).length, 4);
  assert.match(headLines({ ...cod, payment_type: 'COD' })[3], /^COD FOR RUPEES/);
  assert.equal(labelOrderLine(pre), orderLine(pre));
  assert.equal(labelOrderLine({ ...cod, payment_type: 'COD' }), codOrderLine({ ...cod, payment_type: 'COD' }));
});

test('COD screen, address first + "Size 7 COD 2250": name / address right, size 7, label "COD 2250 (Size 7)" (17 Nov 2026)', () => {
  const r = parseCodMessage(`Haryana  Ambala city Jalbera road Sop nambar 27 Dashmesh Dairy
Raheem Shah
PINCODE.134003
Mobile number 
74047 14701
Size 7 COD 2250`);
  assert.equal(r.ship_name, 'Raheem Shah');
  assert.equal(r.address, 'Haryana Ambala city Jalbera road Sop nambar 27 Dashmesh Dairy');
  assert.equal(r.amount, 2250);
  assert.equal(r.size, '7');
  assert.equal(r.note, 'Size 7');
  // words after the amount still come first in their place: "Size 8 COD 1999 pona sanke" -> "Size 8 pona sanke"
  assert.equal(parseCodMessage('Ramesh Patil\nKothrud Pune 411038\n9822000003\nSize 8 COD 1999 pona sanke').note, 'Size 8 pona sanke');
  // a COD line without a size before it is unchanged
  assert.equal(parseCodMessage('Ramesh Patil\nKothrud Pune 411038\n9822000003\nCOD 1299 Size-7 no sanke').note, 'Size-7 no sanke');
});

// ------------------------------------------------------------------ several pairs, one box, one label (client, 17 Nov 2026)
const TWO_PAIRS = `Venkat Prahlad Gaekwad.
Tirumala diary.peddamangalaram village.area.syno.290/A Chanda nagar.Road  p mangalaram moinabad T.S.state 
PINCODE 501504
  mob.9404181436
Size 7 z patti kolhapur 
Size 11 3 tail Sankeshwar COD. 2798`;

test('2 pairs on COD: both on the one label, sizes "7, 11", COD total 2798', () => {
  const r = parseCodMessage(TWO_PAIRS);
  assert.equal(r.size, '7, 11');
  assert.equal(r.pairs, 2);
  assert.equal(r.amount, 2798);
  assert.equal(r.note, 'Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar');
  assert.equal(r.pincode, '501504');
  assert.equal(r.mobile1, '9404181436');
  assert.equal(labelOrderLine({ ...r, payment_type: 'COD', raw_message: TWO_PAIRS }), 'COD 2798 (Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar)');
});

test('2 pairs pasted on PREPAID: both kept, and "COD. 2798" (with a dot) makes the screen ask', () => {
  const r = parseWhatsApp(TWO_PAIRS);
  assert.equal(r.size, '7, 11');
  assert.equal(r.pairs, 2);
  assert.equal(r.saysCod, 2798);
  const noCod = TWO_PAIRS.replace(' COD. 2798', '');
  const p = parseWhatsApp(noCod);
  assert.equal(p.note, 'Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar');
  assert.equal(p.saysCod, null);
  assert.equal(labelOrderLine({ ...p, payment_type: 'PREPAID', raw_message: noCod }), 'PREPAID (Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar)');
});

test('10 pairs: every size in order, nothing lost; prices on every line add up on PREPAID', () => {
  const sizes = [7, 8, 8, 9, 10, 11, 6, 7, 9, 10];
  const msg = 'Ravi Kumar\nFlat 3, MG Road, Pune 411001\n9822000004\n' + sizes.map((n, i) => `Size ${n} kolhapuri ${i + 1}`).join('\n') + '\nCOD 15990';
  const r = parseCodMessage(msg);
  assert.equal(r.pairs, 10);
  assert.equal(r.size, sizes.join(', '));
  assert.equal(r.amount, 15990);
  assert.ok(r.note.length <= 500 && r.size.length <= 100, 'fits the database');
  const pre = parseWhatsApp('Sita Rao\nLane 2, Kothrud, Pune 411038\n9822000005\nSize 8 red kapshi 1299\nSize 6 black 999');
  assert.equal(pre.size, '8, 6');
  assert.equal(pre.amount, 2298);
  // one pair stays exactly as before
  assert.equal(parseWhatsApp('Sita Rao\nLane 2, Kothrud, Pune 411038\n9822000005\nSize 8 red kapshi 1299').size, '8');
  assert.equal(parseWhatsApp('Sita Rao\nLane 2, Kothrud, Pune 411038\n9822000005\nSize 8 red kapshi 1299').pairs, 1);
});

test('several pairs typed or edited by hand: the sizes print once, not twice', () => {
  const base = { ship_name: 'A', address: 'B', pincode: '411001', mobile1: '9822000001', raw_message: '' };
  assert.equal(codOrderLine({ ...base, payment_type: 'COD', amount: 2798, size: '7, 11', note: 'Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar' } as LabelOrder),
    'COD 2798 (Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar)');
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '7, 11', note: 'Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar' } as LabelOrder),
    'PREPAID (Size 7 z patti kolhapur, Size 11 3 tail Sankeshwar)');
  // only sizes typed, no note
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '7, 11', note: '' } as LabelOrder), 'PREPAID (Size 7, 11)');
  assert.equal(codOrderLine({ ...base, payment_type: 'COD', amount: 999, size: '7, 11', note: '' } as LabelOrder), 'COD 999 (Size 7, 11)');
  // one size still as before
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '9', note: 'red' } as LabelOrder), 'PREPAID (9 no, red)');
});

test('a pair line without "Size" ("9 kapsi maharaja naal") between size lines is kept, in order (18 Nov 2026)', () => {
  const msg = `Venkat Prahlad Gaekwad.
Tirumala diary.peddamangalaram village.area.syno.290/A Chanda nagar.Road  p mangalaram moinabad T.S.state 
PINCODE 501504
  mob.9404181436
Size 7 z patti kolhapur 
Size 8 kapsi plus naal
 9 kapsi maharaja naal
Size 11 3 tail Sankeshwar COD. 2798`;
  const r = parseCodMessage(msg);
  assert.equal(r.size, '7, 8, 11'); // "9 kapsi…" has no "Size": kept in Note, its size typed by staff (18 Nov 2026)
  assert.equal(r.pairs, 4);
  assert.equal(r.note, 'Size 7 z patti kolhapur, Size 8 kapsi plus naal, 9 kapsi maharaja naal, Size 11 3 tail Sankeshwar');
  assert.ok(!r.address.includes('maharaja'), 'not in the address');
  assert.equal(labelOrderLine({ ...r, payment_type: 'COD', raw_message: msg }), 'COD 2798 (Size 7 z patti kolhapur, Size 8 kapsi plus naal, 9 kapsi maharaja naal, Size 11 3 tail Sankeshwar)');
  // a house number line is still address: "12 Shivaji Nagar" with no size line next to it
  const a = parseWhatsApp('Ramesh Patil\n12 Shivaji Nagar\nKolhapur 416001\n9822000006\nSize 8 red kapshi');
  assert.ok(a.address.includes('12 Shivaji Nagar'));
  assert.equal(a.size, '8');
  // first pair line without "Size", the next with it
  const b = parseCodMessage('Ramesh Patil\nShivaji Nagar, Kolhapur 416001\n9822000006\n10 kapsi naal\nSize 9 shahu COD 2400');
  assert.equal(b.size, '9');
  assert.equal(b.note, '10 kapsi naal, Size 9 shahu');
});

// ------------------------------------------------------------------ never lose a product line; Size only when marked (18 Nov 2026)
const HEAD = `Venkat Prahlad Gaekwad.
Tirumala diary.peddamangalaram village.area.syno.290/A Chanda nagar.Road  p mangalaram moinabad T.S.state 
PINCODE 501504
  mob.9404181436
`;
test('"11 3 tail Sankeshwar" without "Size": kept in Note as written (never lost, never in the address), Size empty', () => {
  const cases: [string, 'COD' | 'PREPAID', string, string][] = [
    ['11 3 tail Sankeshwar COD. 2798', 'COD', '11 3 tail Sankeshwar', 'COD 2798 (11 3 tail Sankeshwar)'],
    ['11 3 tail Sankeshwar\nCOD 2798', 'COD', '11 3 tail Sankeshwar', 'COD 2798 (11 3 tail Sankeshwar)'],
    ['11 3 tail Sankeshwar', 'PREPAID', '11 3 tail Sankeshwar', 'PREPAID (11 3 tail Sankeshwar)'],
    ['7 z patti kolhapur\n11 3 tail Sankeshwar COD. 2798', 'COD', '7 z patti kolhapur, 11 3 tail Sankeshwar', 'COD 2798 (7 z patti kolhapur, 11 3 tail Sankeshwar)'],
    ['Size 11 3 tail Sankeshwar COD. 2798', 'COD', 'Size 11 3 tail Sankeshwar', 'COD 2798 (Size 11 3 tail Sankeshwar)'],
  ];
  for (const [tail, type, note, label] of cases) {
    const msg = HEAD + tail;
    const r = type === 'COD' ? parseCodMessage(msg) : parseWhatsApp(msg);
    assert.equal(r.note, note, tail);
    assert.ok(!/tail|patti/.test(r.address), `not in the address: ${tail}`);
    assert.equal(r.size, tail.startsWith('Size 11') ? '11' : '', `Size only when written as a size: ${tail}`);
    assert.equal(labelOrderLine({ ...r, payment_type: type, raw_message: msg }), label);
  }
  // pairs are still counted for the tag, even without sizes
  assert.equal(parseCodMessage(HEAD + '7 z patti kolhapur\n11 3 tail Sankeshwar COD. 2798').pairs, 2);
  // a label word before COD is not a note
  assert.equal(parseCodMessage(HEAD + 'Total COD 2798').note, '');
});

test('size typed by hand next to a pasted note: never printed twice', () => {
  const base = { ship_name: 'A', address: 'B', pincode: '411001', mobile1: '9822000001' };
  const msg = HEAD + '11 3 tail Sankeshwar COD. 2798';
  // note from the paste: prints alone
  assert.equal(codOrderLine({ ...base, payment_type: 'COD', amount: 2798, size: '11', note: '11 3 tail Sankeshwar', raw_message: msg } as LabelOrder), 'COD 2798 (11 3 tail Sankeshwar)');
  // note edited by hand, size typed: the line already starts with 11
  assert.equal(codOrderLine({ ...base, payment_type: 'COD', amount: 2798, size: '11', note: '11 3 tail Sankeshwar black', raw_message: '' } as LabelOrder), 'COD 2798 (11 3 tail Sankeshwar black)');
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '7, 11', note: '7 z patti kolhapur, 11 3 tail Sankeshwar', raw_message: '' } as LabelOrder), 'PREPAID (7 z patti kolhapur, 11 3 tail Sankeshwar)');
  // a different size typed is still printed
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '9', note: 'kapsi naal', raw_message: '' } as LabelOrder), 'PREPAID (9 no, kapsi naal)');
});

test('a line with no number between size lines ("kapsi maharaja naal") stays in Note, never the address (18 Nov 2026)', () => {
  const msg = HEAD + 'Size 7 z patti kolhapur\nSize 8 kapsi plus naal\nkapsi maharaja naal\nSize 11 3 tail Sankeshwar COD. 2798';
  const r = parseCodMessage(msg);
  assert.equal(r.note, 'Size 7 z patti kolhapur, Size 8 kapsi plus naal, kapsi maharaja naal, Size 11 3 tail Sankeshwar');
  assert.ok(!r.address.includes('maharaja'));
  assert.equal(r.size, '7, 8, 11');
  assert.equal(labelOrderLine({ ...r, payment_type: 'COD', raw_message: msg }), 'COD 2798 (Size 7 z patti kolhapur, Size 8 kapsi plus naal, kapsi maharaja naal, Size 11 3 tail Sankeshwar)');
  // last line before the COD line, and on PREPAID
  const m2 = HEAD + 'Size 8 kapsi plus naal\nmaharaja naal black\nCOD 2798';
  assert.equal(parseCodMessage(m2).note, 'Size 8 kapsi plus naal, maharaja naal black');
  const p = parseWhatsApp(HEAD + 'Size 8 kapsi plus naal\nmaharaja naal black');
  assert.equal(p.note, 'Size 8 kapsi plus naal, maharaja naal black');
  assert.ok(!p.address.includes('maharaja'));
});

test('"(Size : 7. Awaj Shahu Kolhapuri)" – full stop after the size: Size 7 on both screens, line kept (18 Nov 2026)', () => {
  const msg = `Naam : Laxman Mallinath Wachche
Address: Manyata Tech Park N1 Building TCFM Nagavara
Landmark : Manyata Tech Park N1 Building TCFM Nagavara 560045
State: Karnataka
Pincode - 560045
Mobile No: 7770036704

COD 2249/- (Size : 7. Awaj Shahu Kolhapuri)`;
  const r = parseCodMessage(msg);
  assert.equal(r.size, '7');
  assert.equal(r.amount, 2249);
  assert.equal(labelOrderLine({ ...r, payment_type: 'COD', raw_message: msg }), 'COD 2249 (Size : 7. Awaj Shahu Kolhapuri)');
  const p = parseWhatsApp(msg); // pasted on PREPAID: the line is not lost, and the screen asks "is this COD?"
  assert.equal(p.size, '7');
  assert.equal(p.note, 'COD 2249/- (Size : 7. Awaj Shahu Kolhapuri)');
  assert.equal(p.saysCod, 2249);
  // half sizes still work; a plain total line adds nothing to the note
  assert.equal(parseCodMessage('Ramesh\nLatur 413512\n9850011223\nCOD 1499 Size 7.5 kapsi').size, '7.5');
  assert.equal(parseWhatsApp('Ramesh\nLatur 413512\n9850011223\nSize 8 red\nTotal 1599').note, 'Size 8 red');
  assert.equal(parseWhatsApp('Ramesh\nLatur 413512\n9850011223\nSize 8 red\n₹1,599.00 (estimated total)').note, 'Size 8 red');
  // size typed by hand + note "Size : 7. …" edited: not printed twice
  assert.equal(codOrderLine({ ship_name: 'A', address: 'B', pincode: '411001', mobile1: '9822000001', payment_type: 'COD', amount: 2249, size: '7', note: 'Size : 7. Awaj Shahu', raw_message: '' } as LabelOrder), 'COD 2249 (Size : 7. Awaj Shahu)');
});

test('the note at the end, after the mobiles ("9 kapsi Kolhapuri naal ,COD 1799 (8 no lokare sahu awaj)"): never the address (18 Nov 2026)', () => {
  const msg = `vijay giri
At. Shrisankul  apartment  3 flour flat no 7 vinayk nager lean no 2 new sangvi pimple gurav pune neer marvellous scool pincode 411061
Mob. No 8378830571
9881270271
9272741689
9 kapsi Kolhapuri naal ,COD 1799 (8 no lokare sahu awaj)`;
  const r = parseCodMessage(msg);
  assert.equal(r.amount, 1799); // ",COD" (comma right before) is found
  assert.equal(r.address, 'At. Shrisankul apartment 3 flour flat no 7 vinayk nager lean no 2 new sangvi pimple gurav pune neer marvellous scool');
  assert.equal(r.size, '8'); // "8 no" inside the brackets
  assert.equal(labelOrderLine({ ...r, payment_type: 'COD', raw_message: msg }), 'COD 1799 (9 kapsi Kolhapuri naal 8 no lokare sahu awaj)');
  const p = parseWhatsApp(msg);
  assert.ok(!p.address.includes('kapsi'));
  assert.equal(p.note, '9 kapsi Kolhapuri naal ,COD 1799 (8 no lokare sahu awaj)');
  assert.equal(p.saysCod, 1799);
  // any wording after the last mobile goes to Note; lines before it are still address
  const q = parseWhatsApp('Sunil More\nPlot 5, Station Road\nNear Ganesh temple\nLatur 413512\n9822012345\nred colour, pack carefully');
  assert.equal(q.note, 'red colour, pack carefully');
  assert.ok(q.address.includes('Near Ganesh temple') || q.landmark.includes('Near Ganesh temple'));
  assert.ok(!q.address.includes('pack carefully'));
});

test('three mobiles: all kept and all printed on the label, in the order given (18 Nov 2026)', () => {
  const msg = `vijay giri
At. Shrisankul  apartment  3 flour flat no 7 vinayk nager lean no 2 new sangvi pimple gurav pune neer marvellous scool pincode 411061
Mob. No 8378830571
9881270271
9272741689
9 kapsi Kolhapuri naal ,COD 1799 (8 no lokare sahu awaj)`;
  for (const r of [parseCodMessage(msg), parseWhatsApp(msg)]) {
    assert.equal(r.mobile1, '8378830571');
    assert.equal(r.mobile2, '9881270271');
    assert.equal(r.mobile_more, '9272741689');
    assert.deepEqual(findUnused(msg, r as any).filter((l) => /9272741689/.test(l)), [], 'not reported as unused');
    const lines = toLines({ ...r, payment_type: 'COD' } as LabelOrder);
    assert.ok(lines.includes('Mob. 8378830571, 9881270271, 9272741689'), lines.join(' | '));
  }
  // 4 numbers; a number written twice prints once
  const r4 = parseWhatsApp('Ramesh\nLatur 413512\n9822000001\n9822000002\n9822000003\n9822000004 / 9822000001');
  assert.equal(r4.mobile_more, '9822000003, 9822000004');
  assert.ok(toLines({ ...r4, payment_type: 'PREPAID' } as LabelOrder).includes('Mob. 9822000001, 9822000002, 9822000003, 9822000004'));
  // one or two numbers: nothing changes
  assert.equal(parseWhatsApp('Ramesh\nLatur 413512\n9822000001').mobile_more, '');
});

test('size typed by hand ("8 9") with a pasted note made of 2 lines: the sizes are not repeated (18 Nov 2026)', () => {
  const msg = `vijay giri
At. Shrisankul  apartment  3 flour flat no 7 vinayk nager lean no 2 new sangvi pimple gurav pune neer marvellous scool pincode 411061
Mob. No 8378830571
9881270271
9272741689
9 kapsi Kolhapuri naal
COD 1799 (8 no lokare sahu awaj)`;
  const r = parseCodMessage(msg);
  assert.equal(r.note, '9 kapsi Kolhapuri naal, 8 no lokare sahu awaj');
  for (const size of ['8 9', '8, 9', '8/9', '9', '8']) {
    assert.equal(labelOrderLine({ ...r, size, payment_type: 'COD', raw_message: msg }), 'COD 1799 (9 kapsi Kolhapuri naal, 8 no lokare sahu awaj)', size);
  }
  // note edited by hand (no longer pasted): sizes it already says are not added again
  const base = { ship_name: 'A', address: 'B', pincode: '411001', mobile1: '9822000001', raw_message: '' };
  assert.equal(codOrderLine({ ...base, payment_type: 'COD', amount: 1799, size: '8 9', note: '9 kapsi naal, 8 no lokare' } as LabelOrder), 'COD 1799 (9 kapsi naal, 8 no lokare)');
  assert.equal(orderLine({ ...base, payment_type: 'PREPAID', size: '8 9', note: '9 kapsi naal, 8 no lokare' } as LabelOrder), 'PREPAID (9 kapsi naal, 8 no lokare)');
});

test('client 18 Nov 2026: "DIST RAICHUR KARNATAKA 584170" -> District, State and Pincode each in their own box', () => {
  const msg = 'Veeresh\nAddress Type 7 h no 217 RTPS COLONY SHAKTINAGAR TQ RAICHUR\nDIST RAICHUR KARNATAKA 584170\n+91 88676 26576\n\nCOD 1799 ( 10 no lokare shahu awaj )';
  const r = parseCodMessage(msg);
  assert.equal(r.pincode, '584170');
  assert.equal(r.district, 'RAICHUR');
  assert.equal(r.state, 'Karnataka');
  assert.equal(r.address, 'Type 7 h no 217 RTPS COLONY SHAKTINAGAR TQ RAICHUR');
  assert.equal(r.mobile1, '8867626576');
  assert.equal(r.amount, 1799);
  assert.equal(r.note, '10 no lokare shahu awaj');
  assert.deepEqual(r.missing, []);
  assert.deepEqual(findUnused(msg, r as any), []);
  // also "Dist: Pune 411061" and "State Maharashtra - 411061"
  const b = parseWhatsApp('Ravi Patil\nFlat 4, Shivaji Road\nDist: Pune 411061\n9876543210');
  assert.equal(b.pincode, '411061'); assert.equal(b.district, 'Pune');
  const c = parseWhatsApp('Ravi Patil\nFlat 4, Shivaji Road\nState Maharashtra - 411061\n9876543210');
  assert.equal(c.pincode, '411061'); assert.equal(c.state, 'Maharashtra');
});

test('client 18 Nov 2026: ":=" labels, "(400099)" in the address, "maharashtra ( Mumbai )" – Pincode prints once, no empty ( )', () => {
  const msg = 'Name :=. Saurabh santosh devrukhkar\nAddress:= vile Parle shree ram nagar western  express Highway vile Parle East (400099)\nLedmark:=  flora marbal\nState := maharashtra ( Mumbai )\nPincode;= 400099\nPhone number ;= 7448210573\n9361956859\nSize 8 Ringa COD 1199';
  const r = parseCodMessage(msg);
  assert.equal(r.address, 'vile Parle shree ram nagar western express Highway vile Parle East, Mumbai');
  assert.equal(r.state, 'Maharashtra');
  assert.equal(r.pincode, '400099');
  assert.equal(r.landmark, 'flora marbal');
  assert.equal(r.mobile1, '7448210573'); assert.equal(r.mobile2, '9361956859');
  assert.equal(r.size, '8'); assert.equal(r.amount, 1199); assert.equal(r.note, 'Size 8 Ringa');
  assert.deepEqual(findUnused(msg, r as any), []);
  const lines = toLines({ ...r, district: 'Mumbai Suburban', payment_type: 'COD' } as any).join('\n');
  assert.equal((lines.match(/pin\s*code/gi) ?? []).length, 1, lines);
  assert.ok(!/\(\s*\)/.test(lines), lines);
});

test('client 18 Nov 2026: every way of writing the mark after a label (":-", ";=", "=>", ":_" …) is read the same', () => {
  for (const s of [':-', ' :- ', ';-', ':=', ';=', '=>', '::', ':--', '-:', '- ', '.:-', ' : - ', ';', ':–', ':_', '=']) {
    const m = `Name${s} Saurabh santosh devrukhkar\nAddress${s} vile Parle shree ram nagar western express Highway vile Parle East\nLandmark${s} flora marbal\nState${s} maharashtra\nPincode${s} 400099\nPhone number${s} 7448210573\nSize 8 Ringa COD 1199`;
    const r = parseCodMessage(m);
    assert.equal(r.ship_name, 'Saurabh santosh devrukhkar', s);
    assert.equal(r.address, 'vile Parle shree ram nagar western express Highway vile Parle East', s);
    assert.equal(r.landmark, 'flora marbal', s);
    assert.equal(r.state.toLowerCase(), 'maharashtra', s);
    assert.equal(r.pincode, '400099', s);
    assert.equal(r.mobile1, '7448210573', s);
    assert.deepEqual(findUnused(m, r as any), [], s);
  }
});

test('client 19 Nov 2026: NEVER lose a word of a product line – 15 kinds of lines, alone and with a 2nd pair, PREPAID and COD', () => {
  const head = 'Syed Wasim\nSupermarket Prakash Mall, Kalburgi\nPin code 585101\n7021194571';
  const prods = ['Size 7  naal black colour', 'Size  7 naal black colour', 'SIZE- 9 CUTKAAN KaPSHI 1799', 'size:7 awaj  shahu', 'Size : 7. Awaj Shahu', 'Size-8 pona sanke awaj', 'size 8no red kapsi', 'Size 11 3 tail Sankeshwar', '9 kapsi maharaja naal', '11 no black shahu 2999+ naal', 'Size 7 z patti kolhapur', 'Size big black', '(SIZE- 9 CUTKAAN KaPSHI 1799)', 'Size 10   naal + sole', '8 no lokare sahu awaj', 'Size..9 shahu', 'size:-8 kapsi', 'Size = 7 awaj', 'Size__9 naal'];
  const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const a of prods) for (const b of ['', 'Size 10 naal black colour']) for (const cod of [false, true]) {
    const msg = `${head}\n${a}${b ? '\n' + b : ''}${cod ? '\nCOD 1999' : ''}`;
    const r = cod ? parseCodMessage(msg) : parseWhatsApp(msg);
    const o = { ...r, raw_message: msg, payment_type: cod ? 'COD' : 'PREPAID' } as unknown as LabelOrder;
    const printed = new Set(words(cod ? codOrderLine(o) : orderLine(o)));
    const lost = [a, b].filter(Boolean).flatMap((l) => words(l).filter((w) => !printed.has(w)));
    assert.deepEqual(lost, [], `${cod ? 'COD' : 'PREPAID'}: ${a} | ${b}`);
  }
});

test('client 19 Nov 2026: "Size 7&6 no rec kurundwad" = 2 pairs of one product; "6,7&8" = 3; "Size 6,7" (comma only) is not split', () => {
  const head = 'Lukhman Khan\nseoni madhya pardesh imran auto parts alfa medical ke pass sahed wad\n480661\n8085000491\n6232689225\n';
  const msg = head + 'Size 7&6 no rec kurundwad (cod 2598)';
  const r = parseCodMessage(msg);
  assert.deepEqual([r.size, r.pairs, r.amount, r.note], ['7, 6', 2, 2598, 'Size 7&6 no rec kurundwad']);
  assert.equal(codOrderLine({ ...r, raw_message: msg, payment_type: 'COD' } as unknown as LabelOrder), 'COD 2598 (Size 7&6 no rec kurundwad)');
  const cases: [string, string, number][] = [
    ['Size 6,7&8 rec kurundwad', '6, 7, 8', 3],
    ['Size 6, 7 & 8 no rec kurundwad', '6, 7, 8', 3],
    ['Size 6 and 7 rec kurundwad', '6, 7', 2],
    ['7&6 no rec kurundwad', '7, 6', 2],
    ['Size 7 rec kurundwad', '7', 1],
    ['Size 6,7 rec kurundwad', '6', 1],
  ];
  for (const [line, size, pairs] of cases) for (const p of [parseWhatsApp(head + line), parseCodMessage(head + line + ' COD 2598')]) {
    assert.deepEqual([p.size, p.pairs], [size, pairs], line);
    assert.ok(p.note.startsWith(line), `${line} -> note ${p.note}`);
  }
});

test('client 19 Nov 2026: "Size..9 cod 2250" (two dots) fills Size 9; any mix of marks after "Size"', () => {
  const head = 'P Satyanarayana\nAddress. Shop no 14\nBowenpally market\nSecunderabad\n500009\nMobile 9912444440\n';
  const msg = head + 'Size..9 cod 2250';
  const r = parseCodMessage(msg);
  assert.deepEqual([r.size, r.amount, r.note], ['9', 2250, 'Size..9']);
  assert.equal(codOrderLine({ ...r, raw_message: msg, payment_type: 'COD' } as unknown as LabelOrder), 'COD 2250 (Size..9)');
  for (const l of ['Size:-9 kapsi', 'Size = 9 kapsi', 'size...9 kapsi', 'Size;9 kapsi', 'Size__9 kapsi', 'Size :- 9 kapsi']) {
    assert.equal(parseWhatsApp(head + l).size, '9', l);
    assert.equal(parseCodMessage(head + l + ' COD 1999').size, '9', l);
  }
});

test('client 19 Nov 2026: "Address updated. Gate No…" – "updated" / "new" / "correct"… are part of the label, never printed', () => {
  const tail = '\nDeregaon, VTC: Malegaon\nPost Office: Malegaon,\nDistrict: Nashik,\nState: Maharashtra,\nPIN Code: 423203\nMobile: 7620055440\n8446515440\nSize 7 COD 2250';
  for (const lab of ['Address updated.', 'Address updated:', 'Updated address:', 'New address -', 'Correct address', 'Address - updated', 'Delivery address:', 'नवीन पत्ता:', 'Address:']) {
    const m = `Akhlaq Ahmed Ashfaq Ahmed\n${lab} Gate No. 38/2, House No. 289/200, Sayyad Park` + tail;
    const r = parseCodMessage(m);
    assert.equal(r.address, 'Gate No. 38/2, House No. 289/200, Sayyad Park, Deregaon, VTC: Malegaon, Post Office: Malegaon', lab);
    assert.deepEqual([r.ship_name, r.district, r.pincode, r.mobile1, r.mobile2, r.size, r.amount], ['Akhlaq Ahmed Ashfaq Ahmed', 'Nashik', '423203', '7620055440', '8446515440', '7', 2250], lab);
    assert.deepEqual(findUnused(m, r as any), [], lab);
  }
});
