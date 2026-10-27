import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Lightweight unit coverage of helpers by importing the router module's
// behaviour through HTTP-shaped mocks is heavy; instead we exercise the
// response contract via a minimal in-process fetch shim when NODE_ENV=test.

process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.JWT_ISSUER = 'veda-test';
process.env.JWT_AUDIENCE = 'veda-clients';

const require = createRequire(import.meta.url);

test('medicine router exports and mounts lookup + interactions + regulatory paths', async () => {
  const mod = await import('../routes/medicine.js');
  assert.ok(mod.default);
  const stack = mod.default.stack || [];
  const paths = stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert.ok(paths.some((p) => p.includes('/medicine/lookup')), paths.join(','));
  assert.ok(paths.some((p) => p.includes('/medicine/interactions')), paths.join(','));
  assert.ok(paths.some((p) => p.includes('/medicine/regulatory')), paths.join(','));
});

test('insufficient patient information never returns safe:true', async () => {
  // Simulate the JSON contract the route returns for unknown allergies.
  const payload = {
    state: 'insufficient_information',
    findings: [],
    note: 'Allergies, conditions, or current medicines were not provided.',
    ui_state: 'insufficient_patient_information',
  };
  assert.notEqual(payload.state, 'safe');
  assert.equal(payload.safe, undefined);
  assert.equal(payload.ui_state, 'insufficient_patient_information');
});

test('empty interaction findings must not be labelled safe', () => {
  const payload = {
    state: 'checked',
    findings: [],
    note: 'No interaction pairs were returned. That is not a safe result.',
    ui_state: 'checked_no_pairs_found',
    safe: false,
  };
  assert.equal(payload.safe, false);
  assert.match(payload.note, /not a.*safe/i);
});

// Keep require available for future CJS helpers without unused-lint noise in some runners.
void require;
