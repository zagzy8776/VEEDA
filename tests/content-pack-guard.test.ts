import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { looksLikeLicenseNumber, validateContentPack } from '../src/app/contentPack.ts';
import { validateReferralPack } from '../backend/triage/referral.js';

// The repo may be PUBLIC, so no pack, example, or test may carry a real license
// number or any patient data. These tests pin the license-number guard and that
// the shipped example packs stay refused in production.

function readJson(relative: string) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));
}

test('a credential TYPE is allowed but a license NUMBER is flagged', () => {
  assert.equal(looksLikeLicenseNumber('Physician'), false);
  assert.equal(looksLikeLicenseNumber('Registered Nurse'), false);
  assert.equal(looksLikeLicenseNumber('MBBS, FMCP'), false);
  assert.equal(looksLikeLicenseNumber('1234567'), true);
  assert.equal(looksLikeLicenseNumber('RN-123456'), true);
  assert.equal(looksLikeLicenseNumber('MDCN/1234567'), true);
  assert.equal(looksLikeLicenseNumber(''), false);
});

test('the intake validator refuses a pack whose credential is a license number', () => {
  const base = {
    id: 'x', version: '1', reviewer: 'A', reviewDate: '2026-01-01', region: 'NG',
    clinicallyReviewed: true, entries: [{ id: 'q', prompt: 'p', type: 'yes_no', required: true }],
  };
  assert.equal(validateContentPack({ ...base, reviewerCredential: 'Physician' }).ok, true);
  const withNumber = validateContentPack({ ...base, reviewerCredential: '1234567' });
  assert.equal(withNumber.ok, false);
  if (!withNumber.ok) assert.match(withNumber.reason, /license number/i);
});

test('the referral validator refuses a pack whose credential is a license number', () => {
  const referral = readJson('../backend/triage/referralPack.example.json');
  assert.equal(validateReferralPack({ ...referral, reviewerCredential: 'RN-123456' }).ok, false);
  assert.equal(validateReferralPack({ ...referral, reviewerCredential: 'Physician' }).ok, true);
});

test('the shipped EXAMPLE referral pack is refused in production and works in development', () => {
  const example = readJson('../backend/triage/referralPack.example.json');
  assert.equal(example.clinicallyReviewed, false);
  assert.equal(validateReferralPack(example, { production: true }).ok, false);
  assert.equal(validateReferralPack(example).ok, true);
});

test('no shipped pack, migration, or example contains a long digit run (a license-number smell)', () => {
  // Scan the pack/example files that ship in the repo for anything that looks
  // like a license number. Dates and version strings are fine; a 5+ digit run in
  // a reviewer/credential field is not.
  const files: string[] = [
    '../src/app/intakePack.sample.json',
    '../backend/triage/referralPack.sample.json',
    '../backend/triage/referralPack.example.json',
  ];
  for (const relative of files) {
    const pack = readJson(relative);
    for (const field of ['reviewer', 'reviewerCredential']) {
      const value = pack[field];
      if (value == null) continue;
      assert.equal(looksLikeLicenseNumber(String(value)), false, `${relative} ${field} must not look like a license number`);
    }
  }
});
