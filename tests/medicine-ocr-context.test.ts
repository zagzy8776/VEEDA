import test from 'node:test';
import assert from 'node:assert/strict';

import { assessOcrUncertainty } from '../src/app/medicineOcr.ts';
import {
  buildBeforeTakingGate,
  deriveMedicineUiState,
  medicineUiStateLabel,
  parseMedicineLabel,
  type DrugKnowledgeResult,
} from '../src/app/medicineIntelligence.ts';
import {
  emptyPatientHealthContext,
  hasUnknownMedicineContext,
  knownField,
  loadPatientHealthContext,
  noneField,
  patientHealthContextKey,
  savePatientHealthContext,
  unknownField,
} from '../src/app/patientHealthContext.ts';
import { perUserDeviceKeys } from '../src/app/api.ts';

test('blurry / low-confidence OCR marks name and strength uncertain without guessing', () => {
  const assessed = assessOcrUncertainty('???', 20, [{ text: '???', confidence: 10 }]);
  assert.equal(assessed.uncertain, true);
  assert.ok(assessed.uncertainFields.includes('name'));
  assert.equal(assessed.label.name, null);
});

test('partial label leaves missing fields null and listed as uncertain', () => {
  const assessed = assessOcrUncertainty('AMOXIL\nBatch AB1', 80, [
    { text: 'AMOXIL', confidence: 90 },
    { text: 'Batch', confidence: 88 },
    { text: 'AB1', confidence: 70 },
  ]);
  assert.equal(assessed.label.name, 'AMOXIL');
  assert.equal(assessed.label.strength, null);
  assert.ok(assessed.uncertainFields.includes('strength'));
});

test('empty allergies array legacy means unknown, not none', () => {
  const label = parseMedicineLabel('AMOXIL\n500 mg tablets\nEXP 2027-01-01');
  const gate = buildBeforeTakingGate({
    label,
    context: { allergies: [], conditions: [], currentMedicines: [] },
  });
  assert.equal(gate.insufficientPatientInformation, true);
  assert.ok(gate.flags.some(f => /allergies are not provided/i.test(f)));
});

test('explicit none vs known allergies are distinguished', () => {
  const label = parseMedicineLabel('AMOXIL\n500 mg tablets\nEXP 2027-01-01');
  const noneGate = buildBeforeTakingGate({
    label,
    context: {
      allergies: noneField(),
      conditions: noneField(),
      currentMedicines: noneField(),
    },
  });
  assert.equal(noneGate.insufficientPatientInformation, false);

  const knownGate = buildBeforeTakingGate({
    label,
    context: {
      allergies: knownField(['penicillin']),
      conditions: noneField(),
      currentMedicines: noneField(),
    },
  });
  assert.ok(knownGate.flags.some(f => /penicillin/i.test(f)));
});

test('UI state never treats identity match as authentic package', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: true,
    drug_information_available: true,
    interaction_information_available: true,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'Name ≠ authentic' },
    active_ingredient: 'amoxicillin',
    rxcui: '723',
    note: 'Found',
  };
  const patient = {
    ...emptyPatientHealthContext(),
    allergies: noneField(),
    conditions: noneField(),
    currentMedicines: noneField(),
  };
  const state = deriveMedicineUiState({
    knowledge,
    interactions: { state: 'checked', findings: [], note: 'none', ui_state: 'checked_no_pairs_found', safe: false },
    patient,
    labelConfirmed: true,
  });
  assert.equal(state, 'identity_found_authenticity_not_established');
  assert.match(medicineUiStateLabel(state), /authenticity not established/i);
});

test('missing patient context yields insufficient_patient_information', () => {
  const patient = emptyPatientHealthContext();
  assert.equal(hasUnknownMedicineContext(patient), true);
  const state = deriveMedicineUiState({
    knowledge: null,
    interactions: null,
    patient,
    labelConfirmed: true,
  });
  assert.equal(state, 'insufficient_patient_information');
});

test('patient health context is per-user and in the logout clear set', () => {
  assert.ok(perUserDeviceKeys('u1').includes(patientHealthContextKey('u1')));

  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };

  const ctx = emptyPatientHealthContext();
  ctx.allergies = knownField(['sulfa']);
  ctx.conditions = unknownField();
  assert.equal(savePatientHealthContext('u1', ctx), true);
  const loaded = loadPatientHealthContext('u1');
  assert.equal(loaded.allergies.status, 'known');
  assert.deepEqual(loaded.allergies.values, ['sulfa']);
  assert.equal(loaded.conditions.status, 'unknown');
});

test('Nigerian-style free-text name still parses without inventing strength', () => {
  const label = parseMedicineLabel('Lonart DS\nManufactured by Bliss GVS\nBatch: NG9988');
  assert.equal(label.name, 'Lonart DS');
  assert.equal(label.strength, null);
  assert.equal(label.batch, 'NG9988');
});
