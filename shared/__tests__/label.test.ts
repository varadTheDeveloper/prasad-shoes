// What is printed in the "TO" block. Run: cd server && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines } from '../label';

const base = { ship_name: 'Devidas shinde', payment_type: 'PREPAID' as const };

function noRepeats(lines: string[], ...values: string[]) {
  const text = lines.join('\n');
  for (const v of values) {
    const n = text.split(v).length - 1;
    assert.equal(n, 1, `"${v}" printed ${n} times:\n${text}`);
  }
}

test('already-saved order with pincode + mobile inside the address (screenshot 1)', () => {
  const lines = toLines({
    ...base,
    address: 'कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर पिन कोड 413255 +91 72760-52601',
    state: 'Maharashtra',
    pincode: '413255',
    mobile1: '7276052601',
  });
  assert.deepEqual(lines, ['कोंडी गाव, उत्तर सोलापूर जिल्हा सोलापूर', 'Maharashtra', 'Mob. 7276052601', 'Pin code 413255']);
});

test('already-saved order, spaces in the number (screenshot 2)', () => {
  const lines = toLines({
    ...base,
    address: 'कोठी गाव, उत्तर सोलापूर जिल्हा सोलापूर पिन कोड 413255 +91 72760 52603',
    state: 'Maharashtra',
    pincode: '413255',
    mobile1: '7276052603',
  });
  noRepeats(lines, '413255');
  assert.ok(!lines[0].includes('+91') && !lines[0].includes('72760'), lines.join('\n'));
  assert.equal(lines[0], 'कोठी गाव, उत्तर सोलापूर जिल्हा सोलापूर');
});

test('state / district / landmark already in the address are not printed again', () => {
  const lines = toLines({
    ...base,
    address: 'Vill Tekumatla, Jaipur mandal, Manchiryal, Telangana',
    landmark: 'Jaipur mandal',
    district: 'Manchiryal',
    state: 'Telangana',
    pincode: '504216',
    mobile1: '8106093098',
    mobile2: '8106093098',
  });
  assert.deepEqual(lines, ['Vill Tekumatla, Jaipur mandal, Manchiryal, Telangana', 'Mob. 8106093098', 'Pin code 504216']);
});

test('normal order prints every line once, in the shop order: address, landmark, district, state, mobile, pincode', () => {
  const lines = toLines({
    ...base,
    address: 'Raj nivas, rajapur, udgir, latur',
    landmark: 'Near grampanchaya',
    state: 'Maharashtra',
    pincode: '413578',
    mobile1: '8463995363',
    mobile2: '8495898999',
  });
  assert.deepEqual(lines, [
    'Raj nivas, rajapur, udgir, latur',
    'Near grampanchaya',
    'Maharashtra',
    'Mob. 8463995363, 8495898999',
    'Pin code 413578',
  ]);
  // District and state each on their own line
  assert.deepEqual(toLines({ ...base, address: 'Kondi gaon', district: 'Solapur', state: 'Maharashtra', pincode: '413255', mobile1: '7276052603' }), [
    'Kondi gaon',
    'Solapur',
    'Maharashtra',
    'Mob. 7276052603',
    'Pin code 413255',
  ]);
});

test('other numbers in the address (house no, plot no) are kept', () => {
  const lines = toLines({ ...base, address: 'House no 45, Plot 1234, Ward 3', pincode: '411001', mobile1: '9822012345' });
  assert.equal(lines[0], 'House no 45, Plot 1234, Ward 3');
});
