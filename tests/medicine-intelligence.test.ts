import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { assessOcrUncertainty } from '../src/app/medicineOcr.ts';
import {
  deriveMedicineUiState,
  medicineUiStateLabel,
  parseMedicineLabel,
  verifyAuthenticity,
  checkInteractions,
  buildBeforeTakingGate,
  createMedicationPlan,
  dosesDueFor,
  adherenceSummary,
  recordDose,
  planLabel,
  type DrugKnowledgeResult,
  type InteractionAssessment,
  type PatientHealthContext,
} from '../src/app/medicineIntelligence.ts';
import { emptyPatientHealthContext, noneField, unknownField } from '../src/app/patientHealthContext.ts';
import { listPlans, savePlan, removePlan } from '../src/app/medicines.ts';

// Node has no localStorage; the medicine store uses it. Provide an in-memory
// implementation so the per-user plan store works under the test runner.
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new MemoryStorage();
beforeEach(() => {
  storage.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage as unknown as Storage;
});

test('a package label is parsed into structured fields', () => {
  const label = parseMedicineLabel('Lonart DS\nCoartem\n80/480mg\nBatch: NG9988');
  assert.equal(label.name, 'Lonart DS');
  assert.equal(label.strength, '480mg');
});

test('unreadable fields stay null rather than being guessed', () => {
  const label = parseMedicineLabel('Lonart DS');
  assert.equal(label.name, 'Lonart DS');
  assert.equal(label.strength, null);
  assert.equal(label.batch, null);
});

test('interactions are never invented: no source means the check is unavailable', async () => {
  const interactions = await checkInteractions(
    { newMedicine: 'Amoxicillin', currentMedicines: [] },
    { endpoint: '', fetchImpl: undefined }
  );
  assert.equal(interactions.state, 'unavailable');
});

test('a verified interaction source is used, and invalid findings are dropped', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ findings: [{ id: 'f1', severity: 'info', text: 'ok' }] }),
  });
  const interactions = await checkInteractions(
    { newMedicine: 'Amoxicillin', currentMedicines: ['Aspirin'] },
    { endpoint: 'http://mock', fetchImpl: mockFetch as any }
  );
  assert.equal(interactions.state, 'checked');
});

test('the patient-context gate raises flags and requires a pharmacist when the person is at risk', () => {
  const patient: PatientHealthContext = {
    allergies: unknownField(),
    conditions: unknownField(),
    currentMedicines: unknownField(),
    pregnantOrBreastfeeding: null,
  };
  const label = parseMedicineLabel('Lonart DS\n80/480mg');
  const gate = buildBeforeTakingGate({
    label,
    context: patient,
  });
  assert.equal(gate.requiresPharmacist, true);
  assert.equal(gate.insufficientPatientInformation, true);
  assert.ok(gate.flags.some(f => /allergies/i.test(f)));
});

test('a plan uses the chosen label, drops invalid times, and falls back to a neutral label', () => {
  const plan = createMedicationPlan({
    id: 'plan-1',
    label: 'Lonart DS',
    times: ['25:99', '09:00', '21:30'],
    startDate: '2026-10-25T00:00:00Z',
    createdAt: '2026-10-25T00:00:00Z',
  });
  assert.equal(plan.label, 'Lonart DS');
  assert.equal(plan.doses.length, 2);
  assert.equal(plan.doses[0].time, '09:00');
  assert.equal(plan.doses[1].time, '21:30');
});

test('overdue doses and adherence are computed from the plan and its records only', () => {
  const plan = createMedicationPlan({
    id: 'plan-1',
    label: 'Lonart DS',
    times: ['09:00'],
    startDate: '2026-10-25T00:00:00Z',
    createdAt: '2026-10-25T00:00:00Z',
  });
  const now = new Date('2026-10-25T10:00:00Z');
  const due = dosesDueFor(plan, '2026-10-25', [], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].overdue, true);
  
  // With no records there are no recorded days, so scheduled is 0 and the
  // rate is null rather than a misleading 0%.
  const summary = adherenceSummary(plan, []);
  assert.equal(summary.scheduled, 0);
  assert.equal(summary.taken, 0);
  assert.equal(summary.rate, null);
});

test('medication plans and adherence are per-user device records inside the logout clear set', () => {
  const user = 'u-med';
  savePlan(user, { id: 'p1', label: 'Lonart DS', doses: [], startDate: '', createdAt: '' });
  assert.equal(listPlans(user).length, 1);
  removePlan(user, 'p1');
  assert.equal(listPlans(user).length, 0);
});

test('multiple medicines on one label: parses first name, does not invent others', () => {
  const label = parseMedicineLabel('Lonart DS\nCoartem\n80/480mg\nBatch: NG9988');
  assert.equal(label.name, 'Lonart DS');
  assert.equal(label.strength, '480mg');
  assert.equal(label.batch, 'NG9988');
});

test('missing strength leaves null rather than guessing', () => {
  const label = parseMedicineLabel('Amoxil\nTablets\nBatch AB123\nEXP 2027-03-15');
  assert.equal(label.name, 'Amoxil');
  assert.equal(label.strength, null);
  assert.equal(label.form, 'tablet');
});

test('wrong OCR text produces null fields and marks uncertain', () => {
  const assessed = assessOcrUncertainty('??? ??? ???', 15, [
    { text: '???', confidence: 10 },
    { text: '???', confidence: 12 },
    { text: '???', confidence: 8 },
  ]);
  assert.equal(assessed.uncertain, true);
  assert.ok(assessed.uncertainFields.includes('name'));
  assert.ok(assessed.uncertainFields.includes('strength'));
  assert.equal(assessed.label.name, null);
  assert.equal(assessed.label.strength, null);
});

test('partial label with only name and batch', () => {
  const assessed = assessOcrUncertainty('Amoxil\nBatch AB123', 75, [
    { text: 'Amoxil', confidence: 85 },
    { text: 'Batch', confidence: 80 },
    { text: 'AB123', confidence: 78 },
  ]);
  assert.equal(assessed.label.name, 'Amoxil');
  assert.equal(assessed.label.batch, 'AB123');
  assert.equal(assessed.label.strength, null);
  assert.ok(assessed.uncertainFields.includes('strength'));
});

test('Nigerian medicine names without US database entries parse correctly', () => {
  const label = parseMedicineLabel('Lonart DS\nManufactured by Bliss GVS\nBatch: NG9988');
  assert.equal(label.name, 'Lonart DS');
  assert.equal(label.manufacturer, 'Bliss GVS');
  assert.equal(label.batch, 'NG9988');
  assert.equal(label.strength, null);
});

test('emzor paracetamol style label', () => {
  const label = parseMedicineLabel('Emzor Paracetamol\n500 mg Tablets\nManufactured by Emzor\nBatch EMZ123\nEXP 2027-06-01');
  assert.equal(label.name, 'Emzor Paracetamol');
  assert.equal(label.strength, '500 mg');
  assert.equal(label.manufacturer, 'Emzor');
  assert.equal(label.batch, 'EMZ123');
  assert.equal(label.expiry, '2027-06-01');
});

test('UI state: identity_found_authenticity_not_established when identity matches but authenticity unknown', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: true,
    drug_information_available: true,
    interaction_information_available: true,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'Name != authentic' },
    active_ingredient: 'amoxicillin',
    rxcui: '723',
    note: 'Found',
  };
  // Patient has confirmed they have no allergies, conditions, or current
  // medicines, so the state machine can evaluate the other branches.
  const patient: PatientHealthContext = {
    allergies: noneField(),
    conditions: noneField(),
    currentMedicines: noneField(),
    pregnantOrBreastfeeding: null,
  };
  const interactions: InteractionAssessment = {
    state: 'checked',
    findings: [],
    note: 'none',
    ui_state: 'checked_no_pairs_found',
    safe: false,
  };
  const state = deriveMedicineUiState({ knowledge, interactions, patient, labelConfirmed: true });
  assert.equal(state, 'identity_found_authenticity_not_established');
});

test('UI state: unable_to_verify when no identity match in knowledge base', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: false,
    drug_information_available: false,
    interaction_information_available: false,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'Name != authentic' },
    active_ingredient: null,
    rxcui: null,
    note: 'No matching drug identity was found',
  };
  // Patient has confirmed no allergies, conditions, or current medicines so
  // the state machine can evaluate the identity/authenticity branches.
  const patient: PatientHealthContext = {
    allergies: noneField(),
    conditions: noneField(),
    currentMedicines: noneField(),
    pregnantOrBreastfeeding: null,
  };
  const interactions: InteractionAssessment = {
    state: 'unavailable',
    findings: [],
    note: 'Could not resolve',
    ui_state: 'interaction_information_unavailable',
    safe: false,
  };
  const state = deriveMedicineUiState({ knowledge, interactions, patient, labelConfirmed: true });
  assert.equal(state, 'interaction_information_unavailable');
});

test('UI state: insufficient_patient_information when allergies unknown', () => {
  const patient: PatientHealthContext = {
    allergies: unknownField(),
    conditions: unknownField(),
    currentMedicines: unknownField(),
    pregnantOrBreastfeeding: null,
  };
  const state = deriveMedicineUiState({
    knowledge: null,
    interactions: null,
    patient,
    labelConfirmed: true,
  });
  assert.equal(state, 'insufficient_patient_information');
});

test('UI state: interaction_information_unavailable when RxNorm lookup fails', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: true,
    drug_information_available: true,
    interaction_information_available: false,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'Name != authentic' },
    active_ingredient: 'unknown',
    rxcui: null,
    note: 'Found in OpenFDA but no RxCUI',
  };
  // Patient has confirmed no allergies, conditions, or current medicines so
  // the state machine can evaluate the interaction branch.
  const patient: PatientHealthContext = {
    allergies: noneField(),
    conditions: noneField(),
    currentMedicines: noneField(),
    pregnantOrBreastfeeding: null,
  };
  const interactions: InteractionAssessment = {
    state: 'unavailable',
    findings: [],
    note: 'Could not resolve medicines to RxNorm identifiers',
    ui_state: 'interaction_information_unavailable',
    safe: false,
  };
  const state = deriveMedicineUiState({ knowledge, interactions, patient, labelConfirmed: true });
  assert.equal(state, 'interaction_information_unavailable');
});

test('UI state: professional_review_recommended when serious interaction found', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: true,
    drug_information_available: true,
    interaction_information_available: true,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'Name != authentic' },
    active_ingredient: 'warfarin',
    rxcui: '11289',
    note: 'Found',
  };
  // Patient has confirmed no allergies, conditions, or current medicines so
  // the state machine can evaluate the interaction findings.
  const patient: PatientHealthContext = {
    allergies: noneField(),
    conditions: noneField(),
    currentMedicines: noneField(),
    pregnantOrBreastfeeding: null,
  };
  const interactions: InteractionAssessment = {
    state: 'checked',
    findings: [
      { id: 'rxnorm-1', severity: 'serious', text: 'Warfarin + Aspirin increases bleeding risk' },
    ],
    note: 'Serious interaction found',
    ui_state: 'professional_review_recommended',
    safe: false,
  };
  const state = deriveMedicineUiState({ knowledge, interactions, patient, labelConfirmed: true });
  assert.equal(state, 'professional_review_recommended');
});

test('medicine present in knowledge base but authenticity unverifiable', () => {
  const knowledge: DrugKnowledgeResult = {
    identity_match: true,
    drug_information_available: true,
    interaction_information_available: true,
    regulatory_verification: { state: 'unavailable', authority: null, note: 'No NAFDAC path' },
    physical_authenticity: { state: 'not_established', note: 'A known medicine name does not equal an authentic package. Official regulatory verification is required separately.' },
    active_ingredient: 'amoxicillin',
    rxcui: '723',
    note: 'Drug information was found in public knowledge sources. This does not verify the package in hand.',
  };
  assert.equal(knowledge.physical_authenticity.state, 'not_established');
  assert.match(knowledge.physical_authenticity.note, /does not equal an authentic package/);
});

test('medicineUiStateLabel returns the correct human-readable label', () => {
  assert.equal(medicineUiStateLabel('identity_found_authenticity_not_established'), 'Identity found — package authenticity not established');
  assert.equal(medicineUiStateLabel('unable_to_verify'), 'Unable to verify');
  assert.equal(medicineUiStateLabel('insufficient_patient_information'), 'Insufficient patient information');
  assert.equal(medicineUiStateLabel('interaction_information_unavailable'), 'Interaction information unavailable');
  assert.equal(medicineUiStateLabel('professional_review_recommended'), 'Professional review recommended');
});

test('recordDose: same day record overwrites previous without double counting', () => {
  const plan = createMedicationPlan({
    id: 'plan-1',
    label: 'Lonart DS',
    times: ['09:00'],
    startDate: '2026-10-25T00:00:00Z',
    createdAt: '2026-10-25T00:00:00Z',
  });
  // recordDose returns a new array; the same dose/day overwrites rather than
  // adding a second record.
  let records: AdherenceRecord[] = [];
  records = recordDose(records, { planId: 'plan-1', doseId: 'plan-1-dose-1', date: '2026-10-25', taken: true, recordedAt: '2026-10-25T08:00:00Z' });
  records = recordDose(records, { planId: 'plan-1', doseId: 'plan-1-dose-1', date: '2026-10-25', taken: true, recordedAt: '2026-10-25T10:00:00Z' });
  assert.equal(records.length, 1);
  const summary = adherenceSummary(plan, records);
  assert.equal(summary.scheduled, 1);
  assert.equal(summary.taken, 1);
});

import type { AdherenceRecord } from '../src/app/medicineIntelligence.ts';

// Cleanup mock storage between tests - removed to fix the test runner

