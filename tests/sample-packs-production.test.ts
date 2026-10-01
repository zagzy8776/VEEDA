import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadIntakePack } from '../src/app/intake.ts';
import { evaluateReferral, validateReferralPack } from '../backend/triage/referral.js';

// The real sample packs that ship in the repo. These are placeholders kept only
// for local development and must never be usable in production.
const intakeSample = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/intakePack.sample.json', import.meta.url)), 'utf8'),
);
const referralSample = JSON.parse(
  readFileSync(fileURLToPath(new URL('../backend/triage/referralPack.sample.json', import.meta.url)), 'utf8'),
);

test('both shipped sample packs declare they are NOT clinically reviewed', () => {
  assert.equal(intakeSample.clinicallyReviewed, false);
  assert.equal(referralSample.clinicallyReviewed, false);
  assert.equal(intakeSample.reviewer, 'NOT CLINICALLY REVIEWED');
  assert.equal(referralSample.reviewer, 'NOT CLINICALLY REVIEWED');
});

test('production mode refuses BOTH the sample intake pack and the sample referral pack', () => {
  // Intake: production refuses the unreviewed sample.
  const intake = loadIntakePack(intakeSample, { production: true });
  assert.equal(intake.ok, false, 'the sample intake pack must be refused in production');
  if (!intake.ok) assert.match(intake.reason, /not clinically reviewed/i);

  // Referral: production refuses the unreviewed sample, and never fails open to
  // a reassuring "self_care" decision.
  const referral = evaluateReferral({ total: 9, complete: true }, referralSample, { production: true });
  assert.equal(referral.action, 'unavailable', 'the sample referral pack must be refused in production');
  assert.notEqual(referral.action, 'self_care');
  assert.equal(validateReferralPack(referralSample, { production: true }).ok, false);
});

test('the same sample packs work in development so local testing is possible', () => {
  assert.equal(loadIntakePack(intakeSample).ok, true);
  assert.notEqual(evaluateReferral({ total: 9, complete: true }, referralSample).action, 'unavailable');
});
