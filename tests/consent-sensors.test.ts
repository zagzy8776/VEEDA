import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_ITEMS, SERVER_FEATURE, recordConsent, hasConsent, type StorageLike } from '../src/app/consent.ts';

class TestStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

test('every sensor feature has its own consent item and server feature', () => {
  const sensors = ['camera_sensor', 'mic_sensor', 'motion_sensor', 'location_sensor', 'caregiver_alerts', 'detector_baseline'] as const;
  for (const feature of sensors) {
    assert.ok(CONSENT_ITEMS.some(i => i.feature === feature), `${feature} must have a consent item`);
    assert.ok(typeof SERVER_FEATURE[feature] === 'string' && SERVER_FEATURE[feature].length > 0, `${feature} must map to a server feature`);
  }
});

test('each sensor consent is independent per user and does not grant others', () => {
  const storage = new TestStorage();
  recordConsent(storage, 'u1', 'camera_sensor');
  assert.equal(hasConsent(storage, 'u1', 'camera_sensor'), true);
  assert.equal(hasConsent(storage, 'u1', 'mic_sensor'), false);
  assert.equal(hasConsent(storage, 'u2', 'camera_sensor'), false);
});
