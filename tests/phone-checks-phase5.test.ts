import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQuality, buildGuidedCapture, DEFAULT_REQUIREMENT } from '../src/app/captureQuality.ts';
import { runPhoneCheck, PHONE_CHECKS } from '../src/app/phoneChecks.ts';
import { buildRegistry, type ModelRegistration } from '../src/app/modelRegistry.ts';
import { buildTraceCsv, PHONE_CHECK_EXPORT_HEADER_NOTE } from '../src/app/phoneCheckExport.ts';

const good = { width: 1000, height: 1000, sharpness: 0.8, brightness: 0.5, coverage: 0.5 };

test('the quality gate passes a good capture and names each retake reason', () => {
  assert.equal(checkQuality(good).ok, true);
  assert.equal((checkQuality({ ...good, sharpness: 0.1 }) as { reason: string }).reason, 'blur');
  assert.equal((checkQuality({ ...good, brightness: 0.05 }) as { reason: string }).reason, 'too_dark');
  assert.equal((checkQuality({ ...good, brightness: 0.99 }) as { reason: string }).reason, 'too_bright');
  assert.equal((checkQuality({ ...good, coverage: 0.01 }) as { reason: string }).reason, 'poor_framing');
  assert.equal((checkQuality({ ...good, width: 100 }) as { reason: string }).reason, 'too_small');
});

test('guided capture needs pack prompts but falls back to the default requirement', () => {
  assert.equal(buildGuidedCapture({}), null);
  const built = buildGuidedCapture({ task: 'hemoglobin_anemia', prompts: [{ id: 'p1', text: 'place finger' }] });
  assert.ok(built);
  assert.equal(built?.prompts.length, 1);
  assert.equal(built?.requirement.minSharpness, DEFAULT_REQUIREMENT.minSharpness);
});

test('a phone check refuses without consent and reports a retake on bad quality', () => {
  const registry = buildRegistry([]);
  const check = PHONE_CHECKS[0];
  assert.equal(runPhoneCheck(check, good, false, registry).state, 'no_consent');
  assert.equal(runPhoneCheck(check, { ...good, sharpness: 0.01 }, true, registry).state, 'retake');
});

test('every phone check is "not yet validated" with no model and never returns a result', () => {
  const registry = buildRegistry([]);
  for (const check of PHONE_CHECKS) {
    const outcome = runPhoneCheck(check, good, true, registry);
    assert.equal(outcome.state, 'not_validated', check.id);
    assert.match((outcome as { message: string }).message, /not yet validated/i);
  }
});

test('a clip-on-lens check says so when not validated', () => {
  const registry = buildRegistry([]);
  const outcome = runPhoneCheck(PHONE_CHECKS.find(c => c.id === 'hemoglobin_anemia')!, good, true, registry);
  assert.match((outcome as { message: string }).message, /clip-on lens/i);
});

test('the framework still produces no result even when a model is registered', () => {
  const model: ModelRegistration = {
    task: 'spo2', version: '1.0.0', approved: true,
    validation: { errorRange: 'x', sensitivity: 0.95, specificity: 0.95, reference: 'x', validatedAt: '2026-01-01' },
    acceptance: { minSensitivity: 0.9, minSpecificity: 0.9 },
  };
  const registry = buildRegistry([model]);
  const outcome = runPhoneCheck(PHONE_CHECKS.find(c => c.id === 'spo2')!, good, true, registry);
  assert.equal(outcome.state, 'unavailable');
});

test('the trace export contains no result and a stable header', () => {
  const csv = buildTraceCsv('spo2', [
    { tMs: 0, channels: { r: 1, g: 2, b: 3 } },
    { tMs: 33, channels: { r: 2, g: 3, b: 4 } },
  ]);
  assert.match(csv, /t_ms,b,g,r/);
  assert.match(csv, new RegExp(PHONE_CHECK_EXPORT_HEADER_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(csv, /diagnosis: /);
});
