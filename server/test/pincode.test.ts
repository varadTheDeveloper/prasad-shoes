// Run: npm test. Checks the India Post pincode list and the address / pincode warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPincode, titleCase } from '../src/services/pincode';

const texts = (r: ReturnType<typeof checkPincode>) => r.warnings.map((w) => w.text).join(' | ');

test('known pincode gives district and state, no warnings', () => {
  const r = checkPincode({ pincode: '413255', address: 'कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर' });
  assert.equal(r.found, true);
  assert.deepEqual(r.districts, ['Solapur']);
  assert.equal(r.state, 'Maharashtra');
  assert.deepEqual(r.warnings, []);
});

test('pincode that does not exist: red warning (Mohan Raj test data 413578)', () => {
  const r = checkPincode({ pincode: '413578', address: 'Raj nivas, rajapur, udgir, latur' });
  assert.equal(r.found, false);
  assert.equal(r.warnings[0].level, 'danger');
  assert.match(texts(r), /not in the India Post list/);
});

test('real Udgir pincode with the same address: fine', () => {
  const r = checkPincode({ pincode: '413517', address: 'Raj nivas, rajapur, udgir, latur', state: 'Maharashtra' });
  assert.deepEqual(r.districts, ['Latur']);
  assert.deepEqual(r.warnings, []);
});

test('address in another district: no note (shop asked for none), only a flag (Amit Patil 413526, Latur)', () => {
  const r = checkPincode({ pincode: '413526', address: 'Patil Bunglow, Malkapur, Udgir, Latur', landmark: 'Near Gram Panchayat', state: 'Maharashtra' });
  assert.deepEqual(r.districts, ['Osmanabad']);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.addressNamesOtherDistrict, true);
});

test('no flag when the address agrees with the pincode', () => {
  const ok = (pincode: string, address: string) => assert.equal(checkPincode({ pincode, address }).addressNamesOtherDistrict, false, address);
  ok('415002', 'Shop 3, Pune road, Sadar bazar'); // a road named after another district
  ok('415002', 'Flat 2, Pune Bangalore highway side, Satara'); // own district also written
  ok('415110', 'Somwar peth, Karad, near Latur colony'); // a post office of this pincode
  ok('431001', 'Kranti chowk, Chhatrapati Sambhajinagar'); // new name = old name (Aurangabad)
  ok('411038', 'Flat 4, Anand nagar, Sagar apartment, near vegetable mandi, Kothrud'); // common words
});

test('wrong District / State fields give no orange note either', () => {
  assert.deepEqual(checkPincode({ pincode: '413255', address: 'Kondi', district: 'Pune', state: 'Karnataka' }).warnings, []);
});

test('bad pincode format: nothing to check (the form shows its own error)', () => {
  assert.equal(checkPincode({ pincode: '41100' }).found, false);
  assert.deepEqual(checkPincode({ pincode: '41100' }).warnings, []);
});

test('title case', () => {
  assert.equal(titleCase('JAMMU AND KASHMIR'), 'Jammu and Kashmir');
  assert.equal(titleCase('BENGALURU URBAN'), 'Bengaluru Urban');
});

test('District / State fields that do not match the pincode are reported (the app asks before changing)', () => {
  const r = checkPincode({ pincode: '413526', address: 'Patil Bunglow, Udgir', district: 'Latur', state: 'Karnataka' });
  assert.deepEqual(r.mismatch, { district: { typed: 'Latur', pincode: 'Osmanabad' }, state: { typed: 'Karnataka', pincode: 'Maharashtra' } });
  assert.deepEqual(r.warnings, []);
});

test('matching District / State in any spelling: no mismatch', () => {
  const none = (pincode: string, district: string, state: string) =>
    assert.deepEqual(checkPincode({ pincode, address: 'x', district, state }).mismatch, {}, `${district} / ${state}`);
  none('413255', 'Solapur', 'Maharashtra');
  none('413255', 'SOLAPUR', 'maharashtra');
  none('413255', 'सोलापूर', 'महाराष्ट्र');
  none('413255', 'Sholapur', 'Maharastra'); // old spelling, typo
  none('413501', 'Dharashiv', 'MH'); // new name of Osmanabad, short form
  none('431001', 'Chhatrapati Sambhajinagar', 'Maharashtra');
  none('411001', 'Pune city', 'Maharashtra');
  none('413255', '', ''); // empty fields are filled, not asked
});

test('no District field but the address names another district: reported too (Rahul Patil, Latur / 413526)', () => {
  const r = checkPincode({ pincode: '413526', address: 'Patil Bunglow, Malkapur, Udgir, Latur, Near Gram Panchayat, Maharashtra' });
  assert.deepEqual(r.mismatch, { district: { typed: 'Latur', pincode: 'Osmanabad', inAddress: true } });
  assert.deepEqual(checkPincode({ pincode: '413517', address: 'Patil Bunglow, Udgir, Latur' }).mismatch, {});
});

// ---- Names India Post writes differently, and the customer's town in the District box (Nov 2026) ----
const noAsk = (pincode: string, district: string, state: string) =>
  assert.deepEqual(checkPincode({ pincode, district, state }).mismatch, {}, `${pincode} "${district}" / "${state}" should not ask`);
const asks = (pincode: string, district: string, state = '') =>
  assert.ok(checkPincode({ pincode, district, state }).mismatch.district, `${pincode} "${district}" should ask`);

test('Delhi: "North / South / East / West / Central Delhi" match India Post\'s "North", "South" …', () => {
  noAsk('110033', 'North Delhi', 'Delhi');
  noAsk('110080', 'South Delhi', 'Delhi'); // Sangam Vihar (shop's example)
  noAsk('110016', 'South Delhi', 'Delhi');
  noAsk('110091', 'East Delhi', 'Delhi');
  noAsk('110008', 'West Delhi', 'Delhi');
  noAsk('110002', 'Central Delhi', 'Delhi');
  noAsk('110034', 'North West Delhi', 'Delhi');
  asks('110016', 'North Delhi'); // a South Delhi pincode
});

test('Goa, Ladakh, Sikkim, Puducherry, Mohali, Noida, East Singhbhum: the names customers use', () => {
  noAsk('403001', 'Goa', 'Goa');
  noAsk('194101', 'Leh', 'Ladakh');
  noAsk('194101', 'Ladakh', 'Ladakh');
  noAsk('737101', 'East Sikkim', 'Sikkim');
  noAsk('605001', 'Puducherry', 'Puducherry');
  noAsk('140103', 'Mohali', 'Punjab');
  noAsk('201301', 'Noida', 'Uttar Pradesh');
  noAsk('831001', 'East Singhbhum', 'Jharkhand');
  noAsk('500037', 'Hyderabad', 'Telangana'); // Medchal Malkajgiri pincode
  noAsk('400601', 'Navi Mumbai', 'Maharashtra');
  noAsk('396210', 'Daman', 'Daman and Diu'); // merged UT since 2020
  asks('403001', 'South Goa'); // a North Goa pincode
});

test('town written in the District box: fine when that post office is in the pincode\'s district', () => {
  noAsk('416115', 'Ichalkaranji', 'Maharashtra');
  noAsk('416115', 'Ichalkaranji, Kolhapur', 'Maharashtra');
  noAsk('403001', 'Panaji', 'Goa');
  noAsk('403601', 'Margao City', 'Goa');
  noAsk('737101', 'Gangtok', 'Sikkim');
  noAsk('831001', 'Jamshedpur', 'Jharkhand');
  noAsk('401202', 'Vasai', 'Maharashtra');
  noAsk('421301', 'Kalyan', 'Maharashtra');
  noAsk('410206', 'Panvel', 'Maharashtra');
  // real mismatches still ask
  asks('416115', 'Satara');
  asks('416115', 'Ichalkaranji, Satara');
  asks('415001', 'Latur');
});

test('District to fill: Delhi directions read "West Delhi"; a pincode in two districts fills the first', () => {
  assert.deepEqual(checkPincode({ pincode: '110059' }).districts, ['West Delhi']);
  assert.deepEqual(checkPincode({ pincode: '110017' }).districts, ['South Delhi']);
  assert.deepEqual(checkPincode({ pincode: '110001' }).districts, ['New Delhi']);
  const h = checkPincode({ pincode: '500018' });
  assert.deepEqual(h.districts, ['Hyderabad']);
  assert.deepEqual(h.allDistricts, ['Hyderabad', 'Medchal Malkajgiri']);
  // either of its districts typed by the customer is fine, another district still asks
  assert.deepEqual(checkPincode({ pincode: '500018', district: 'Medchal Malkajgiri', state: 'Telangana' }).mismatch, {});
  assert.deepEqual(checkPincode({ pincode: '500018', district: 'Hyderabad', state: 'Telangana' }).mismatch, {});
  assert.ok(checkPincode({ pincode: '500018', district: 'Warangal', state: 'Telangana' }).mismatch.district);
  assert.deepEqual(checkPincode({ pincode: '110059', district: 'West Delhi', state: 'Delhi' }).mismatch, {});
});
