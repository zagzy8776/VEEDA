import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.DEFAULT_TENANT_ID = 'test-tenant';

const { validateAlertPack, isSourceTrusted } = await import('../routes/alerts.js');

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/app/alertPack.example.json', import.meta.url)), 'utf8'),
);

const reviewed = {
  id: 'alerts.test', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true,
  entries: [
    { id: 'fire.nearby', kind: 'fire', severity: 'warning', message: 'Fire nearby.', allowedSources: ['trusted_feed', 'paired_alarm'] },
  ],
};

test('fire, smoke and CO can never be raised by a phone guess (server policy matches client)', () => {
  assert.equal(isSourceTrusted('fire', 'phone_guess'), false);
  assert.equal(isSourceTrusted('home_safety', 'phone_guess'), false);
  assert.equal(isSourceTrusted('fire', 'trusted_feed'), true);
  assert.equal(isSourceTrusted('weather', 'device_sensor'), false);
});

test('the example alert pack is refused in production and valid in development', () => {
  assert.equal(validateAlertPack(example, { production: true }).ok, false);
  assert.equal(validateAlertPack(example).ok, true);
});

test('an alert pack with a bad kind or missing provenance is rejected', () => {
  assert.equal(validateAlertPack({ ...reviewed, reviewer: '' }).ok, false);
  assert.equal(
    validateAlertPack({ ...reviewed, entries: [{ ...reviewed.entries[0], kind: 'made_up' }] }).ok,
    false,
  );
});
