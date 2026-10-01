import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateReferral, validateReferralPack } from '../triage/referral.js';

const samplePack = JSON.parse(
  readFileSync(fileURLToPath(new URL('../triage/referralPack.sample.json', import.meta.url)), 'utf8'),
);

function reviewedPack(overrides = {}) {
  return {
    id: 'referral.test',
    version: '1.0.0',
    reviewer: 'Dr. Test',
    reviewDate: '2026-01-01',
    region: 'NG',
    clinicallyReviewed: true,
    entries: [
      { minTotal: 0, maxTotal: 0, action: 'self_care', instruction: 'No referral needed now.' },
      { minTotal: 1, maxTotal: 4, action: 'urgent_care', instruction: 'Contact a clinic soon.' },
      { minTotal: 5, maxTotal: 100, action: 'emergency', instruction: 'Get medical help now.' },
    ],
    ...overrides,
  };
}

const score = (total, complete = true) => ({ total, complete });

test('bands drive the decision; a low score yields self_care', () => {
  const decision = evaluateReferral(score(0), reviewedPack());
  assert.equal(decision.action, 'self_care');
  assert.equal(decision.evaluated, true);
  assert.equal(decision.news2Total, 0);
});

test('a mid score yields urgent_care and surfaces pack provenance', () => {
  const decision = evaluateReferral(score(4), reviewedPack());
  assert.equal(decision.action, 'urgent_care');
  assert.equal(decision.region, 'NG');
  assert.match(decision.reviewedBy, /Dr\. Test/);
});

test('a high score yields emergency', () => {
  assert.equal(evaluateReferral(score(9), reviewedPack()).action, 'emergency');
});

test('bands are read from the pack and are not hard-coded', () => {
  // Same score, different pack, different result proves the pack is the source.
  const custom = reviewedPack({
    entries: [
      { minTotal: 0, maxTotal: 100, action: 'emergency', instruction: 'Everything is urgent in this pack.' },
    ],
  });
  assert.equal(evaluateReferral(score(0), custom).action, 'emergency');
});

test('fails safe when no pack is provided', () => {
  const decision = evaluateReferral(score(9), null);
  assert.equal(decision.action, 'unavailable');
  assert.equal(decision.evaluated, false);
  assert.notEqual(decision.action, 'self_care');
});

test('fails safe when the pack is missing provenance fields', () => {
  for (const field of ['id', 'version', 'reviewer', 'reviewDate', 'region']) {
    const decision = evaluateReferral(score(9), reviewedPack({ [field]: '' }));
    assert.equal(decision.action, 'unavailable', `expected unavailable when ${field} is empty`);
  }
});

test('fails safe when the score is incomplete', () => {
  const decision = evaluateReferral(score(3, false), reviewedPack());
  assert.equal(decision.action, 'unavailable');
  assert.equal(decision.evaluated, false);
});

test('fails safe when the score falls outside every band', () => {
  const gapped = reviewedPack({
    entries: [{ minTotal: 0, maxTotal: 2, action: 'self_care', instruction: 'Low.' }],
  });
  const decision = evaluateReferral(score(30), gapped);
  assert.equal(decision.action, 'unavailable');
});

test('production mode refuses an unreviewed pack', () => {
  const decision = evaluateReferral(score(9), reviewedPack({ clinicallyReviewed: false }), { production: true });
  assert.equal(decision.action, 'unavailable');
});

test('production mode uses a reviewed pack', () => {
  const decision = evaluateReferral(score(9), reviewedPack(), { production: true });
  assert.equal(decision.action, 'emergency');
});

test('the shipped sample pack is NOT clinically reviewed', () => {
  assert.equal(samplePack.clinicallyReviewed, false);
  assert.equal(samplePack.reviewer, 'NOT CLINICALLY REVIEWED');

test('a reviewer credential TYPE is allowed but a license NUMBER is refused (public repo safety)', async () => {
  const { looksLikeLicenseNumber } = await import('../triage/referral.js');
  assert.equal(looksLikeLicenseNumber('Physician'), false);
  assert.equal(looksLikeLicenseNumber('MDCN/1234567'), true);
  assert.equal(looksLikeLicenseNumber('RN-123456'), true);

  assert.equal(validateReferralPack(reviewedPack({ reviewerCredential: 'Physician' })).ok, true);
  const refused = validateReferralPack(reviewedPack({ reviewerCredential: '1234567' }));
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /license number/i);
});

});

test('the sample pack works in development but is refused in production', () => {
  assert.equal(evaluateReferral(score(9), samplePack).action, 'emergency');
  assert.equal(evaluateReferral(score(9), samplePack, { production: true }).action, 'unavailable');
});

test('validateReferralPack rejects an invalid band entry', () => {
  const bad = reviewedPack({ entries: [{ minTotal: 5, maxTotal: 1, action: 'emergency', instruction: 'x' }] });
  assert.equal(validateReferralPack(bad).ok, false);
  const badAction = reviewedPack({ entries: [{ minTotal: 0, maxTotal: 1, action: 'diagnose', instruction: 'x' }] });
  assert.equal(validateReferralPack(badAction).ok, false);
});

test('validateReferralPack rejects an empty band list', () => {
  assert.equal(validateReferralPack(reviewedPack({ entries: [] })).ok, false);
});
