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
