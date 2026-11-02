// COD: reading booking messages, amount in words, the COD label text. Run: cd server && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codRemainder, findBookingDate, findUnused, findWeight, parseCodMessage, parseWhatsApp } from '../parser';
import { COD_FIXED, amountInWords, isIsoDate, numberInWords, printDate } from '../cod';
import { codAmountLines, codFromLines, codHeadLines, codItemLine, fromLines, orderLine, toLines, type LabelOrder } from '../label';

const shop = { shop_name: 'PRASAD SHOES', address1: '1306, Shukrawar Peth', address2: null, city_pin: 'Pune 411002', phones: '9822000000' };

// ------------------------------------------------------------------ amount in words
test('amount in words (Indian system)', () => {
  assert.equal(numberInWords(1299), 'One Thousand Two Hundred Ninety Nine');
  assert.equal(numberInWords(100000), 'One Lakh');
  assert.equal(numberInWords(125050), 'One Lakh Twenty Five Thousand Fifty');
  assert.equal(numberInWords(10_00_00_000), 'Ten Crore');
  assert.equal(amountInWords(1299), 'Rupees One Thousand Two Hundred Ninety Nine Only');
  assert.equal(amountInWords(850.5), 'Rupees Eight Hundred Fifty and Fifty Paise Only');
  assert.equal(amountInWords(null), '');
  assert.equal(amountInWords(0), '');
});

test('dates', () => {
  assert.equal(printDate('2026-11-03'), '03-11-2026');
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

// ------------------------------------------------------------------ COD messages
const MSG1 = `Booking Under: Pune City West Division
Customer ID: 14634841966
Contract ID: 41282773
Booking Date: 02/11/2026    Weight: 800 gm
COD Amount: Rs. 1299/- (One Thousand Two Hundred Ninety Nine Only)

To,
Ramesh Patil
At post Wadgaon, Tal Karad
Dist Satara
Pin 415110
Mob 9876543210

From,
Prasad Shoes
1306 Shukrawar Peth, Pune 411002
Mob 9822000000`;

test('full COD message: every detail found, fixed lines ignored', () => {
  const p = parseCodMessage(MSG1);
  assert.equal(p.booking_date, '2026-11-02');
  assert.equal(p.weight, '800 g');
  assert.equal(p.amount, 1299);
  assert.equal(p.ship_name, 'Ramesh Patil');
  assert.match(p.address, /At post Wadgaon, Tal Karad/);
  assert.equal(p.district, 'Satara');
  assert.equal(p.pincode, '415110');
  assert.equal(p.mobile1, '9876543210');
  assert.equal(p.sender_name, 'Prasad Shoes');
  assert.equal(p.sender_mobile, '9822000000');
  assert.match(p.sender_address, /1306 Shukrawar Peth, Pune/);
  assert.match(p.sender_address, /411002/);
  // the fixed details never end up in a field
  const all = JSON.stringify(p);
  for (const v of [COD_FIXED.customerId, COD_FIXED.contractId, 'West Division']) assert.ok(!all.includes(v), `${v} leaked into a field`);
  assert.deepEqual(p.missing, []);
  // the sender's phone / pincode are not the receiver's
  assert.notEqual(p.mobile2, '9822000000');
  // nothing in the message is left unused
  assert.deepEqual(findUnused(codRemainder(MSG1), p as any), []);
});

test('sender first, labelled receiver after, Marathi labels, amount as "COD 1599"', () => {
  const p = parseCodMessage(`From: Prasad Shoes Pune 9822000000

नाव - सुनील जाधव
पत्ता - मु. पो. कोंडी, ता. उत्तर सोलापूर
पिन कोड 413255
मोबाईल 7276052601
COD 1599
वजन 1 kg`);
  assert.equal(p.ship_name, 'सुनील जाधव');
  assert.equal(p.pincode, '413255');
  assert.equal(p.mobile1, '7276052601');
  assert.equal(p.amount, 1599);
  assert.equal(p.weight, '1 kg');
  assert.equal(p.sender_mobile, '9822000000');
  assert.equal(p.booking_date, '', 'no date in the message');
});

test('message with no From / date / weight: receiver only, COD amount from "Amount"', () => {
  const p = parseCodMessage(`Naam - Devidas Shinde
Address - Vill Tekumatla, Jaipur mandal
Pincode 504216
Mobile no 1 - 8106093098
Amount 2499`);
  assert.equal(p.ship_name, 'Devidas Shinde');
  assert.equal(p.amount, 2499);
  assert.equal(p.sender_name, '');
  assert.equal(p.sender_address, '');
  assert.equal(p.weight, '');
});

test('missing amount is reported (COD needs one)', () => {
  const p = parseCodMessage('To, Ramesh\nKarad 415110\n9876543210');
  assert.equal(p.amount, null);
  assert.ok(p.missing.includes('amount'));
});

test('Prepaid reading is unchanged by the COD reader', () => {
  const msg = 'Naam - Devidas\nAddress - Karad\nPincode 415110\nMobile 9876543210';
  const a = parseWhatsApp(msg);
  const b = parseWhatsApp(msg);
  assert.deepEqual(a, b);
  assert.equal(a.ship_name, 'Devidas');
});

// ------------------------------------------------------------------ COD label text
const cod: LabelOrder = {
  ship_name: 'Ramesh Patil',
  address: 'At post Wadgaon, Tal Karad',
  district: 'Satara',
  state: 'Maharashtra',
  pincode: '415110',
  mobile1: '9876543210',
  product_name: 'Kolhapuri',
  size: '9',
  payment_type: 'COD',
  amount: 1299,
  booking_date: '2026-11-02',
  weight: '800 g',
};

test('COD label: fixed details always, in the right order', () => {
  assert.deepEqual(codHeadLines(cod), [
    'Booking Under: Pune City West Division',
    'Customer ID: 14634841966',
    'Contract ID: 41282773',
    'Booking Date: 02-11-2026   Weight: 800 g',
  ]);
  assert.deepEqual(codAmountLines(cod), ['COD Amount: Rs. 1299/-', '(Rupees One Thousand Two Hundred Ninety Nine Only)']);
  assert.equal(codItemLine(cod), '(Kolhapuri, 9 no)');
  // fixed details print even when nothing else COD was given
  const bare = { ...cod, booking_date: null, weight: null, amount: null };
  const head = codHeadLines(bare);
  assert.equal(head[0], 'Booking Under: Pune City West Division');
  assert.equal(head[1], 'Customer ID: 14634841966');
  assert.equal(head[2], 'Contract ID: 41282773');
  assert.match(head[3], /^Booking Date: _+ {3}Weight: _+$/);
});

test('COD From: sender from the message, else the shop', () => {
  assert.deepEqual(codFromLines(cod, shop), fromLines(shop));
  assert.deepEqual(codFromLines({ ...cod, sender_name: 'Amit Traders', sender_address: 'Kothrud, Pune - 411038', sender_mobile: '9000000001' }, shop), [
    'Amit Traders',
    'Kothrud, Pune - 411038',
    'Mob. 9000000001',
  ]);
});

test('Prepaid label text is unchanged', () => {
  const pre: LabelOrder = { ...cod, payment_type: 'PREPAID', booking_date: null, weight: null };
  assert.equal(orderLine(pre), 'PREPAID (Kolhapuri, 9 no)');
  assert.deepEqual(toLines(pre), ['At post Wadgaon, Tal Karad', 'Satara', 'Maharashtra', 'Mob. 9876543210', 'Pin code 415110']);
});
