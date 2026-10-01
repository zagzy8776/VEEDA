import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CAREGIVERS, caregiversStorageKey, loadCaregivers, saveCaregivers,
  remainingCaregiverSlots, caregiverAlertMessage,
} from '../src/app/caregivers.ts';
import { perUserDeviceKeys } from '../src/app/api.ts';

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

test('the caregiver store is keyed per user and capped', () => {
  const storage = new TestStorage();
  assert.equal(remainingCaregiverSlots('u1', storage), MAX_CAREGIVERS);
  saveCaregivers(storage, 'u1', [
    { name: 'Ada', number: '111' }, { name: 'Bola', number: '222' },
    { name: 'Chidi', number: '333' }, { name: 'Dee', number: '444' },
  ]);
  assert.equal(loadCaregivers(storage, 'u1').length, MAX_CAREGIVERS);
  assert.equal(loadCaregivers(storage, 'u2').length, 0);
});

test('blank entries are dropped and an empty list clears the key', () => {
  const storage = new TestStorage();
  saveCaregivers(storage, 'u1', [{ name: '  ', number: '111' }]);
  assert.equal(storage.getItem(caregiversStorageKey('u1')), null);
});

test('the caregiver key is in the logout clear set', () => {
  assert.ok(perUserDeviceKeys('u1').includes(caregiversStorageKey('u1')));
});

test('the caregiver alert message is neutral and only adds location when known', () => {
  const without = caregiverAlertMessage('Ada');
  assert.match(without, /Ada/);
  assert.match(without, /check on them/i);
  assert.doesNotMatch(without, /\d/);
  const withLoc = caregiverAlertMessage('Ada', '6.5000, 3.3000');
  assert.match(withLoc, /6.5000, 3.3000/);
});
