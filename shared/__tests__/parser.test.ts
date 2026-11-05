// Run: cd server && npm test
// Add every real WhatsApp message that fills wrongly here, then fix parser.ts until it passes.
import { orderLine } from '../label';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsApp, normaliseForHash, normaliseMobile, stateFromPincode } from '../parser';

function check(text: string, expected: Record<string, unknown>) {
  const r = parseWhatsApp(text) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected)) assert.equal(r[k], v, `field ${k}\n--- message ---\n${text}`);
  return r;
}

test('shop template, filled by customer (Sudharshan)', () => {
  check(
    `Naam - Sudharshan
Address - Vill Tekumatla, Jaipur mandal
Landmark - Ups school Tekumatla
State - Telangana
Pincode - 504216
Mobile No 1. 8106093098
Mobile no 2.

Size 10`,
    {
      ship_name: 'Sudharshan',
      address: 'Vill Tekumatla, Jaipur mandal',
      landmark: 'Ups school Tekumatla',
      state: 'Telangana',
      pincode: '504216',
      mobile1: '8106093098',
      mobile2: '',
      size: '10',
    },
  );
});

test('whole chat pasted: amount bubble + empty template + reply', () => {
  const r = check(
    `You
₹1,599.00 (estimated total)
1599
12:39 pm
Address Details

Naam
Address
Landmark ( NEARBY SCHOOL, ROAD , CHOWK )
State
Pincode -
Mobile No 1.
Mobile no 2.

Size
12:39 pm
Naam - Sudharshan
Address - Vill Tekumatla, Jaipur mandal
Landmark - Ups school Tekumatla
Pincode - 504216
Mobile No 1. 8106093098
Size - 10
12:52 pm`,
    {
      ship_name: 'Sudharshan',
      address: 'Vill Tekumatla, Jaipur mandal',
      landmark: 'Ups school Tekumatla',
      pincode: '504216',
      mobile1: '8106093098',
      size: '10',
      amount: 1599,
      state: 'Telangana', // guessed from 50xxxx
    },
  );
  assert.deepEqual(r.missing, []);
  assert.ok((r.guessed as string[]).includes('state'));
});

test('Marathi address with no labels except पिन कोड (Devidas Shinde)', () => {
  check(
    `TO, Devidas shinde
कोंडी गाव
उत्तर सोलापूर जिल्हा सोलापूर
पिन कोड 413255
+91 72760 52603`,
    {
      ship_name: 'Devidas shinde',
      address: 'कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर',
      pincode: '413255',
      mobile1: '7276052603',
      state: 'Maharashtra',
    },
  );
});

test('labels in Marathi, values on next line', () => {
  check(
    `नाव
रमेश पाटील
पत्ता
मु. पो. वडगाव, ता. हवेली
जिल्हा - पुणे
पिन कोड - ४१२३०८
मोबाईल नंबर 1 - ९८२२०१२३४५
साइज - ८`,
    {
      ship_name: 'रमेश पाटील',
      address: 'मु. पो. वडगाव, ता. हवेली',
      district: 'पुणे',
      pincode: '412308',
      mobile1: '9822012345',
      size: '8',
    },
  );
});

test('Hindi labels with colon', () => {
  check(
    `नाम: सुरेश कुमार
पता: गांव रामपुर, पोस्ट सिकंदरपुर
राज्य: उत्तर प्रदेश
पिन: 221001
मोबाइल: 9415012345, 7007012345`,
    {
      ship_name: 'सुरेश कुमार',
      address: 'गांव रामपुर, पोस्ट सिकंदरपुर',
      state: 'उत्तर प्रदेश',
      pincode: '221001',
      mobile1: '9415012345',
      mobile2: '7007012345',
    },
  );
});

test('no labels at all, values in template order', () => {
  check(
    `Sanjay More
At post Kurundwad, Tal Shirol
Near Shivaji chowk
Kolhapur
416106
9890012345
9`,
    {
      ship_name: 'Sanjay More',
      address: 'At post Kurundwad, Tal Shirol, Near Shivaji chowk, Kolhapur',
      pincode: '416106',
      mobile1: '9890012345',
      size: '9',
      state: 'Maharashtra',
    },
  );
});

test('WhatsApp Web copy with [time, date] Name: prefixes', () => {
  check(
    `[12:41 pm, 18/10/2026] Ganesh: Name - Ganesh Jadhav
[12:41 pm, 18/10/2026] Ganesh: Address - Flat 12, Sai Residency, Wakad
[12:42 pm, 18/10/2026] Ganesh: Pin code 411057
[12:42 pm, 18/10/2026] Ganesh: Mob 98220 11223
[12:42 pm, 18/10/2026] Ganesh: Size 9 no`,
    {
      ship_name: 'Ganesh Jadhav',
      address: 'Flat 12, Sai Residency, Wakad',
      pincode: '411057',
      mobile1: '9822011223',
      size: '9',
    },
  );
});

test('multi-line address after label, 0-prefixed mobile, alternate number', () => {
  check(
    `Name : Priya Deshmukh
Address :
House no 45, Gandhi nagar
Behind bus stand
Landmark: Zilla parishad school
Dist: Latur
Pincode: 413512
Mobile: 09422012345
Alternate no: 8888012345`,
    {
      ship_name: 'Priya Deshmukh',
      address: 'House no 45, Gandhi nagar, Behind bus stand',
      landmark: 'Zilla parishad school',
      district: 'Latur',
      pincode: '413512',
      mobile1: '9422012345',
      mobile2: '8888012345',
    },
  );
});

test('pincode inside the address line', () => {
  check(
    `Rahul Pawar
Shivaji peth, Satara 415002
7020012345`,
    { ship_name: 'Rahul Pawar', address: 'Shivaji peth, Satara', pincode: '415002', mobile1: '7020012345' },
  );
});

test('missing fields are reported', () => {
  const r = parseWhatsApp('Naam - Amit\nSize 7');
  assert.deepEqual(r.missing, ['address', 'pincode', 'mobile1']);
});

test('empty text', () => {
  const r = parseWhatsApp('');
  assert.equal(r.ship_name, '');
  assert.equal(r.amount, null);
});

test('helpers', () => {
  assert.equal(normaliseMobile('+91 72760 52603'), '7276052603');
  assert.equal(normaliseMobile('12345'), '');
  assert.equal(stateFromPincode('403001'), 'Goa');
  assert.equal(stateFromPincode('411002'), 'Maharashtra');
  // Same message with different WhatsApp times hashes the same
  assert.equal(normaliseForHash('Naam - A\n12:39 pm'), normaliseForHash('naam -  a\n1:05 PM'));
  assert.notEqual(normaliseForHash('₹1,599.00'), normaliseForHash('₹1,699.00'));
});

test('customer test data: misspelt "Landmmark", "Mobile no1/no2" (Mohan Raj)', () => {
  const r = check(
    `Naam Mohan Raj
Address  Raj nivas, rajapur, udgir, latur
Landmmark Near grampanchaya
State Maharashtra
Pincode 413578
Mobile no1 8463995363
Mobile no2 8495898999`,
    {
      ship_name: 'Mohan Raj',
      address: 'Raj nivas, rajapur, udgir, latur',
      landmark: 'Near grampanchaya',
      state: 'Maharashtra',
      pincode: '413578',
      mobile1: '8463995363',
      mobile2: '8495898999',
    },
  );
  assert.deepEqual(r.missing, []);
});

test('misspelt labels for every field', () => {
  check(
    `Nmae - Sunil Gaikwad
Adress - Gat no 12, Shirur
Lanmark - Behind Hanuman mandir
Distric - Pune
Sate - Maharashtra
Pincod - 412210
Mobil no 1 - 9850012345
Mobaile no.2 - 7350012345
Sise - 8`,
    {
      ship_name: 'Sunil Gaikwad',
      address: 'Gat no 12, Shirur',
      landmark: 'Behind Hanuman mandir',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412210',
      mobile1: '9850012345',
      mobile2: '7350012345',
      size: '8',
    },
  );
});

test('more spellings: Land mark, Addres, Pin cod, Contact no, value on next line', () => {
  check(
    `Name: Kavita Jadhav
Addres:
Flat 4, Shanti Apartment
Kothrud
Land mark: Near D-Mart
Pin cod: 411038
Contact no: 9922012345`,
    {
      ship_name: 'Kavita Jadhav',
      address: 'Flat 4, Shanti Apartment, Kothrud',
      landmark: 'Near D-Mart',
      pincode: '411038',
      mobile1: '9922012345',
    },
  );
});

test('normal words are not taken as labels (no lost information)', () => {
  check(
    `Mobin Shaikh
Statue road, Sangli
Mobile shop lane
416416
9890011122`,
    {
      ship_name: 'Mobin Shaikh',
      address: 'Statue road, Sangli, Mobile shop lane',
      state: 'Maharashtra',
      pincode: '416416',
      mobile1: '9890011122',
    },
  );
});

test('pincode and mobile on the address line are not kept inside the address', () => {
  check(
    `TO, Devidas shinde
कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर पिन कोड 413255 +91 72760-52601`,
    { ship_name: 'Devidas shinde', address: 'कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर', pincode: '413255', mobile1: '7276052601' },
  );
  check(
    `Name - Asha More
Address - Plot 7, Gandhi chowk, Latur Pin code: 413512 Mob no 9850011223 / 9850011224`,
    { address: 'Plot 7, Gandhi chowk, Latur', pincode: '413512', mobile1: '9850011223', mobile2: '9850011224' },
  );
});

// ------------------------------------------------------------- "Not used" lines (findUnused)
import { findUnused } from '../parser';

const unused = (text: string) => findUnused(text, parseWhatsApp(text) as unknown as Record<string, string>);

test('every message in this file: no line is lost', () => {
  const all = [
    `Naam - Sudharshan\nAddress - Vill Tekumatla, Jaipur mandal\nLandmark - Ups school Tekumatla\nState - Telangana\nPincode - 504216\nMobile No 1. 8106093098\nMobile no 2.\n\nSize 10`,
    `You\n₹1,599.00 (estimated total)\n1599\n12:39 pm\nAddress Details\n\nNaam\nAddress\nLandmark ( NEARBY SCHOOL, ROAD , CHOWK )\nState\nPincode -\nMobile No 1.\nMobile no 2.\n\nSize\n12:39 pm\nNaam - Sudharshan\nAddress - Vill Tekumatla, Jaipur mandal\nLandmark - Ups school Tekumatla\nPincode - 504216\nMobile No 1. 8106093098\nSize - 10\n12:52 pm`,
    `TO, Devidas shinde\nकोंडी गाव\nउत्तर सोलापूर जिल्हा सोलापूर\nपिन कोड 413255\n+91 72760 52603`,
    `नाव\nरमेश पाटील\nपत्ता\nमु. पो. वडगाव, ता. हवेली\nजिल्हा - पुणे\nपिन कोड - ४१२३०८\nमोबाईल नंबर 1 - ९८२२०१२३४५\nसाइज - ८`,
    `नाम: सुरेश कुमार\nपता: गांव रामपुर, पोस्ट सिकंदरपुर\nराज्य: उत्तर प्रदेश\nपिन: 221001\nमोबाइल: 9415012345, 7007012345`,
    `Sanjay More\nAt post Kurundwad, Tal Shirol\nNear Shivaji chowk\nKolhapur\n416106\n9890012345\n9`,
    `[12:41 pm, 18/10/2026] Ganesh: Name - Ganesh Jadhav\n[12:41 pm, 18/10/2026] Ganesh: Address - Flat 12, Sai Residency, Wakad\n[12:42 pm, 18/10/2026] Ganesh: Pin code 411057\n[12:42 pm, 18/10/2026] Ganesh: Mob 98220 11223\n[12:42 pm, 18/10/2026] Ganesh: Size 9 no`,
    `Name : Priya Deshmukh\nAddress :\nHouse no 45, Gandhi nagar\nBehind bus stand\nLandmark: Zilla parishad school\nDist: Latur\nPincode: 413512\nMobile: 09422012345\nAlternate no: 8888012345`,
    `Rahul Pawar\nShivaji peth, Satara 415002\n7020012345`,
    `Naam Mohan Raj\nAddress  Raj nivas, rajapur, udgir, latur\nLandmmark Near grampanchaya\nState Maharashtra\nPincode 413578\nMobile no1 8463995363\nMobile no2 8495898999`,
    `Nmae - Sunil Gaikwad\nAdress - Gat no 12, Shirur\nLanmark - Behind Hanuman mandir\nDistric - Pune\nSate - Maharashtra\nPincod - 412210\nMobil no 1 - 9850012345\nMobaile no.2 - 7350012345\nSise - 8`,
    `Name: Kavita Jadhav\nAddres:\nFlat 4, Shanti Apartment\nKothrud\nLand mark: Near D-Mart\nPin cod: 411038\nContact no: 9922012345`,
    `Mobin Shaikh\nStatue road, Sangli\nMobile shop lane\n416416\n9890011122`,
    `TO, Devidas shinde\nकोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर पिन कोड 413255 +91 72760-52601`,
    `Name - Asha More\nAddress - Plot 7, Gandhi chowk, Latur Pin code: 413512 Mob no 9850011223 / 9850011224`,
  ];
  for (const m of all) assert.deepEqual(unused(m), [], m);
});

test('a third phone number has no field: shown as not used', () => {
  assert.deepEqual(unused(`Name - Amit Kale\nAddress - Plot 9, Shivaji nagar, Latur\nPincode 413512\nMob 9850011223, 9850011224, 9850011225`), [
    'Mob 9850011223, 9850011224, 9850011225',
  ]);
});

test('extra lines after Address + Landmark are kept in the address (nothing lost)', () => {
  const text = `Name - Amit Kale\nAddress - Plot 9, Shivaji nagar\nLandmark - Near Hanuman mandir\n\nTaluka Udgir, Dist Latur\nPincode 413517\nMob 9850011223`;
  const r = parseWhatsApp(text);
  assert.equal(r.address, 'Plot 9, Shivaji nagar, Taluka Udgir'); // "Dist Latur" -> District
  assert.equal(r.district, 'Latur');
  assert.deepEqual(unused(text), []);
});

test('text deleted from the form shows up as not used', () => {
  const text = `Name - Amit Kale\nAddress - Plot 9, Shivaji nagar, Udgir\nPincode 413517\nMob 9850011223`;
  const form = { ...parseWhatsApp(text), address: 'Plot 9, Shivaji nagar' };
  assert.deepEqual(findUnused(text, form as unknown as Record<string, string>), ['Address - Plot 9, Shivaji nagar, Udgir']);
});

test('wrong phone numbers after "Mobile No1:" stay in the phone fields, not in the address (Amit Patil)', () => {
  const text = `Name: Amit Patil
Address: Patil Bunglow, Malkapur, Udgir, Latur
Landmark: Near Gram Panchayat
State: Maharashtra
Pincode: 413526
Mobile No1: 0000000000
Mobile No2: 1111111111`;
  const r = check(text, {
    ship_name: 'Amit Patil',
    address: 'Patil Bunglow, Malkapur, Udgir, Latur',
    landmark: 'Near Gram Panchayat',
    state: 'Maharashtra',
    pincode: '413526',
    mobile1: '0000000000', // any 10 digits are accepted
    mobile2: '1111111111',
  });
  assert.deepEqual(findUnused(text, r as unknown as Record<string, string>), []);
});

test('a 5-digit pincode after "Pincode:" stays in the pincode field (shown in red), not in the address', () => {
  check(`Name: Amit Patil\nAddress: Plot 4, Udgir\nPincode: 41352\nMobile: 9850011223`, { address: 'Plot 4, Udgir', pincode: '41352', mobile1: '9850011223' });
});

test('product line "11 no black shahu 2999+ naal": size, amount, note as written – not in the address', () => {
  const text = `Basha\n Near Nutan\nPrashala, Nandi Nagar Vijapur Road,\nSolapur, DIST: Solapur, Maharashtra - 413004\n+91 99219 95554\n\n11 no black shahu 2999+ naal`;
  const r = parseWhatsApp(text);
  assert.equal(r.ship_name, 'Basha');
  assert.equal(r.address, 'Near Nutan, Prashala, Nandi Nagar Vijapur Road, Solapur, Maharashtra');
  assert.equal(r.district, 'Solapur');
  assert.equal(r.pincode, '413004');
  assert.equal(r.mobile1, '9921995554');
  assert.equal(r.size, '11');
  assert.equal(r.product_name, ''); // never guessed – staff type it
  assert.equal(r.amount, 2999);
  assert.equal(r.note, '11 no black shahu 2999+ naal'); // the line as written
  assert.deepEqual(unused(text), []);
});

test('product line variants; an address line starting with a number stays in the address', () => {
  const base = `Ramesh Patil\nShivaji Chowk, Latur\n413512\n9850011223\n`;
  let r = parseWhatsApp(base + '9 no kolhapuri red');
  assert.deepEqual([r.size, r.product_name, r.amount, r.note], ['9', '', null, '9 no kolhapuri red']);
  r = parseWhatsApp(base + '8 pona sanke 1999');
  assert.deepEqual([r.size, r.product_name, r.amount, r.note], ['8', '', 1999, '8 pona sanke 1999']);
  assert.equal(r.address, 'Shivaji Chowk, Latur');
  // "12 Shivaji Nagar" before the pincode / mobile is an address, not a product
  r = parseWhatsApp(`Ramesh Patil\n12 Shivaji Nagar, Latur\n413512\n9850011223`);
  assert.equal(r.address, '12 Shivaji Nagar, Latur');
  assert.equal(r.product_name, '');
  assert.equal(r.size, '');
});

test('"Size 12 antique Hankare kapshi 1799+ naal + sole": Size 12 only, the rest in Note as written', () => {
  const text = `Brijmohan Agarwal\nsri sai ram pooja samagiri stores 8-4-393 erragadda main road\nopp metro pillar no 961 sanathnagar\n hyderabad telangana 500018\n9247130703\n\nSize 12 antique Hankare kapshi 1799+ naal + sole`;
  const r = parseWhatsApp(text);
  assert.equal(r.size, '12');
  assert.equal(r.note, 'Size 12 antique Hankare kapshi 1799+ naal + sole'); // as written
  assert.equal(r.amount, 1799);
  assert.equal(r.product_name, '');
  assert.deepEqual(unused(text), []);
  // no clear size number: Size stays empty, the words are kept in Note
  const m = parseWhatsApp(`Ramesh Patil\nShivaji Chowk, Latur 413512\n9850011223\nSize - medium`);
  assert.deepEqual([m.size, m.note], ['', 'medium']);
  assert.equal(parseWhatsApp(`Ramesh\nLatur 413512\n9850011223\nSize - 9 no`).size, '9');
  assert.equal(parseWhatsApp(`Ramesh\nLatur 413512\n9850011223\nSize: UK 8`).size, '8');
});

test('size line in brackets "(SIZE- 9 CUTKAAN KaPSHI 1799)": Note as written, not in the address; label prints it once', () => {
  const text = `sanket gaddamwar\nAddress - at post gogaon\nLandmark ( NEAR PANCHASHIL BUDDHA VIHAR MAIN  ROAD\n, CHATRAPATI SHIVAJI MAHARAJ CHOWK )\nState - MAHARASHTRA\nPincode -442605\nMobile No 1.- 9403423542\nMobile no 2.\n\n(SIZE- 9 CUTKAAN KaPSHI 1799)`;
  const r = parseWhatsApp(text);
  assert.equal(r.address, 'at post gogaon');
  assert.equal(r.landmark, '( NEAR PANCHASHIL BUDDHA VIHAR MAIN ROAD, CHATRAPATI SHIVAJI MAHARAJ CHOWK )');
  assert.deepEqual([r.size, r.note, r.amount], ['9', 'SIZE- 9 CUTKAAN KaPSHI 1799', 1799]);
  assert.equal(orderLine({ ...r, payment_type: 'PREPAID', raw_message: text }), 'PREPAID (SIZE- 9 CUTKAAN KaPSHI 1799)');
  assert.deepEqual(unused(text), []);
  // typed by hand (no size words in the note): "9 no" and the amount print as before
  assert.equal(orderLine({ ...r, note: 'red', amount: 1299, raw_message: '', payment_type: 'PREPAID' }), 'PREPAID (9 no, red, 1299)');
});
