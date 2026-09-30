import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadIntakePack, isProductionReady } from '../src/app/intake.ts';
import { validateContentPack } from '../src/app/contentPack.ts';

const samplePath = fileURLToPath(new URL('../src/app/intakePack.sample.json', import.meta.url));
const sampleRaw = JSON.parse(readFileSync(samplePath, 'utf8'));

function validPack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intake.test',
    version: '1.0.0',
    reviewer: 'Dr. Test',
    reviewDate: '2026-01-01',
    region: 'NG',
    clinicallyReviewed: true,
    entries: [
      { id: 'q1', prompt: 'Are you alert?', type: 'yes_no' },
    ],
    ...overrides,
  };
}

test('loads a well-formed reviewed pack into typed questions', () => {
  const result = loadIntakePack(validPack());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.pack.questions.length, 1);
  assert.equal(result.pack.questions[0].id, 'q1');
  assert.equal(result.pack.meta.reviewer, 'Dr. Test');
});

test('rejects a pack that is missing provenance fields', () => {
  for (const field of ['id', 'version', 'reviewer', 'reviewDate', 'region']) {
    const result = loadIntakePack(validPack({ [field]: '' }));
    assert.equal(result.ok, false, `expected rejection when ${field} is empty`);
  }
});

test('rejects a pack whose reviewDate is not an ISO date', () => {
  const result = loadIntakePack(validPack({ reviewDate: 'Jan 1 2026' }));
  assert.equal(result.ok, false);
});

test('production mode refuses an unreviewed pack', () => {
  const result = loadIntakePack(validPack({ clinicallyReviewed: false }), { production: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /not clinically reviewed/i);
});

test('production mode accepts a reviewed pack', () => {
  assert.equal(loadIntakePack(validPack(), { production: true }).ok, true);
});

test('the shipped sample pack is explicitly NOT clinically reviewed', () => {
  assert.equal(sampleRaw.clinicallyReviewed, false);
  assert.equal(sampleRaw.reviewer, 'NOT CLINICALLY REVIEWED');
});

test('the sample pack loads in development but is refused in production', () => {
  const dev = loadIntakePack(sampleRaw);
  assert.equal(dev.ok, true);
  const prod = loadIntakePack(sampleRaw, { production: true });
  assert.equal(prod.ok, false);
});

test('rejects a question with an unknown type or empty prompt', () => {
  assert.equal(loadIntakePack(validPack({ entries: [{ id: 'x', prompt: 'y', type: 'diagnose' }] })).ok, false);
  assert.equal(loadIntakePack(validPack({ entries: [{ id: 'x', prompt: '', type: 'text' }] })).ok, false);
});

test('rejects a select question with no options', () => {
  assert.equal(loadIntakePack(validPack({ entries: [{ id: 'x', prompt: 'y', type: 'select' }] })).ok, false);
});

test('isProductionReady reflects the reviewed flag', () => {
  assert.equal(isProductionReady({ id: 'a', version: '1', reviewer: 'r', reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true }), true);
  assert.equal(isProductionReady({ id: 'a', version: '1', reviewer: 'r', reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: false }), false);
});

test('the shared validator is the single gate for every content pack', () => {
  assert.equal(validateContentPack(validPack(), { label: 'pack' }).ok, true);
  assert.equal(validateContentPack(validPack({ clinicallyReviewed: false }), { production: true, label: 'pack' }).ok, false);
});
