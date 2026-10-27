// Medicine intelligence.
//
// The camera is one input channel for the medicine system, never a verdict. A
// photograph can read a label and show whether the PACKAGING looks consistent;
// it can never prove a medicine is genuine. Authenticity stays `unverified`
// until an authoritative verification service (a manufacturer / regulator
// lookup keyed by a serial or registration number) confirms it.
//
// Five fail-safe pieces:
//   1. Label reading  — pure parsing of the text read off a package (name,
//      strength, form, manufacturer, batch, expiry). Parsing always works, so
//      it is honest about what it could and could not read.
//   2. Authenticity   — a CLIENT over a configured authoritative source. With
//      no source configured the verdict is `unverified`, never "genuine".
//   3. Interaction checking — against a configured VERIFIED source only. With
//      no source the check is `unavailable`; it never invents an interaction.
//   4. Patient-context gate — the questions a pharmacist/clinician must answer
//      before this specific person takes this specific medicine.
//   5. Schedule + adherence — a plan of doses for the local calendar reminder
//      (see medicationIcs.ts) plus on-device adherence tracking.
//
// No clinical content (drug names, interaction text, dosing) is hard-coded
// here: interaction text comes from the configured source, and every other
// line is a question or a packaging observation.
//
// Pure module: no storage, no timers. The store lives in medicines.ts.

import { parseExpiry, expiryStatus, type ExpiryStatus } from './foodSafety.ts';
import { NEUTRAL_FALLBACK_LABEL } from './medicationIcs.ts';
import type { ContextField, PatientHealthContext } from './patientHealthContext.ts';
import { hasUnknownMedicineContext } from './patientHealthContext.ts';

export type DosageForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'suspension'
  | 'injection'
  | 'cream'
  | 'ointment'
  | 'drops'
  | 'inhaler'
  | 'sachet'
  | 'other'
  | 'unknown';

export interface MedicineLabel {
  /** The name read off the package, or null when it could not be read. */
  name: string | null;
  /** The strength as printed, e.g. "500 mg" or "250 mg/5 ml". */
  strength: string | null;
  form: DosageForm;
  manufacturer: string | null;
  /** Batch / lot number, used alongside a serial for verification. */
  batch: string | null;
  /** ISO expiry date (YYYY-MM-DD) or null when it could not be read. */
  expiry: string | null;
  /** The raw text that was read, kept so the user can check every field. */
  raw: string;
}

const FORM_PATTERNS: Array<{ form: DosageForm; pattern: RegExp }> = [
  { form: 'tablet', pattern: /\btablets?\b|\btabs?\b|\bcaps?\.?\s*tab\b/i },
  { form: 'capsule', pattern: /\bcapsules?\b|\bcaps?\b/i },
  { form: 'syrup', pattern: /\bsyrup\b/i },
  { form: 'suspension', pattern: /\bsuspension\b|\bsusp\b/i },
  { form: 'injection', pattern: /\binjection\b|\biv\b|\bim\b|\bvial\b|\bampoule\b/i },
  { form: 'cream', pattern: /\bcream\b/i },
  { form: 'ointment', pattern: /\bointment\b|\bgel\b/i },
  { form: 'drops', pattern: /\bdrops?\b/i },
  { form: 'inhaler', pattern: /\binhaler\b|\binhalation\b/i },
  { form: 'sachet', pattern: /\bsachet\b|\bpowder\b/i },
];

const STRENGTH = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|%)\b(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|ml|g))?/i;

// Words that appear on packaging but are not the medicine's name.
const NON_NAME_KEYWORDS = /\b(batch|lot|exp|expiry|expires|mfg|manufactured|made\s+by|store|keep|dosage|dose|direction|warning|medicine|drug|nafdac|registration|tablet|capsule|syrup|suspension|injection|cream|ointment)\b/i;

/**
 * Parse the text read off a medicine package into structured fields. Missing
 * fields come back as null rather than a guess, so the UI can say exactly what
 * it could not read.
 */
export function parseMedicineLabel(raw: string): MedicineLabel {
  const text = String(raw ?? '');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  const strengthMatch = text.match(STRENGTH);
  const strength = strengthMatch ? strengthMatch[0].replace(/\s+/g, ' ').trim() : null;

  const form = (FORM_PATTERNS.find(({ pattern }) => pattern.test(text))?.form) ?? 'unknown';

  const manufacturerLine = text.match(/(?:manufactured\s+by|made\s+by|mfg\.?|manuf\.?)\s*[:.]?\s*([^\n]+)/i);
  const manufacturer = manufacturerLine && manufacturerLine[1].trim() ? manufacturerLine[1].trim() : null;

  const batchLine = text.match(/\b(?:batch|lot|b\.?\s*no|lot\s*no)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{2,})/i);
  const batch = batchLine ? batchLine[1].trim() : null;

  const expiryLine = text.match(/\b(?:exp(?:iry)?|expires?|use\s+before|best\s+before)\b\.?\s*[:.]?\s*([^\n]+)/i);
  const expiry = parseExpiry(expiryLine ? expiryLine[1] : text);

  // The name is the most likely first line that is not a strength-only line and
  // not a packaging keyword. When nothing qualifies it stays null on purpose.
  const nameLine = lines.find(line => {
    if (line.length < 3) return false;
    // Reject obvious OCR artifacts: lines dominated by question marks or
    // non-alphanumeric characters that indicate unreadable text.
    if (/^[\s?]+$/.test(line)) return false;
    if (/^[\d\s./:%-]+$/.test(line)) return false;
    if (STRENGTH.test(line) && line.replace(STRENGTH, '').trim().length < 3) return false;
    return !NON_NAME_KEYWORDS.test(line);
  });
  const name = nameLine ? nameLine.replace(/\s+/g, ' ').trim() : null;

  return { name, strength, form, manufacturer, batch, expiry, raw: text };
}

/** Packaging facts a photograph CAN support. Every one is an observation. */
export type PackageConcernId =
  | 'name_not_read'
  | 'strength_not_read'
  | 'form_not_read'
  | 'expiry_not_read'
  | 'expired'
  | 'expiring_soon'
  | 'batch_not_read';

export interface PackageConcern {
  id: PackageConcernId;
  text: string;
}

export interface PackageAnalysis {
  label: MedicineLabel;
  expiryStatus: ExpiryStatus;
  concerns: PackageConcern[];
  /** Shadowed in the UI with AUTHENTICITY_PHOTO_NOTE. */
  authenticity: AuthenticityResult;
}

/**
 * The packaging facts a photo can support, as observations. Exported so the UI
 * names exactly what could not be read without re-implementing the rules.
 */
export function concernsFor(label: MedicineLabel, status: ExpiryStatus): PackageConcern[] {
  const concerns: PackageConcern[] = [];
  if (!label.name) concerns.push({ id: 'name_not_read', text: 'The medicine name could not be read from the package.' });
  if (!label.strength) concerns.push({ id: 'strength_not_read', text: 'No strength (for example 500 mg) was found on the package.' });
  if (label.form === 'unknown') concerns.push({ id: 'form_not_read', text: 'The dosage form (tablet, syrup, and so on) could not be read.' });
  if (!label.batch) concerns.push({ id: 'batch_not_read', text: 'No batch or lot number was found — a pharmacist needs it to check the medicine.' });
  if (!label.expiry) concerns.push({ id: 'expiry_not_read', text: 'No expiry date could be read. Treat the expiry as unknown.' });
  else if (status === 'expired') concerns.push({ id: 'expired', text: 'The printed expiry date has passed. Do not use it and ask a pharmacist.' });
  else if (status === 'soon') concerns.push({ id: 'expiring_soon', text: 'This medicine is close to its printed expiry date.' });
  return concerns;
}

export const AUTHENTICITY_PHOTO_NOTE =
  'A photo cannot prove a medicine is genuine. It can only show whether the packaging looks consistent — verification needs an official check.';

export const AUTHENTICITY_UNVERIFIED_NOTE =
  'Not verified. No official verification service is connected, so this medicine is unverified either way.';

export type AuthenticityVerdict =
  | 'unverified'
  | 'verified'
  | 'not_found'
  | 'recalled'
  | 'source_unavailable';

export interface AuthenticityResult {
  verdict: AuthenticityVerdict;
  /** Plain explanation for the user. */
  note: string;
  /** Present only when a configured authoritative source returned it. */
  authority?: string;
}

export interface VerificationSource {
  /** The configured authoritative endpoint, or empty when none is set. */
  endpoint: string;
  /** Caller-supplied fetch, so this stays testable and dependency-free. */
  fetchImpl?: typeof fetch;
}

/**
 * Check a medicine against an authoritative verification service using a
 * serial / registration number scanned off the package. With no configured
 * source — or with no code — the verdict is `unverified`. It never guesses.
 */
export async function verifyAuthenticity(code: string | null, source: VerificationSource): Promise<AuthenticityResult> {
  if (!code || !code.trim()) {
    return { verdict: 'unverified', note: 'No verification code was read from the package, so it could not be checked.' };
  }
  if (!source.endpoint || !source.fetchImpl) {
    return { verdict: 'unverified', note: AUTHENTICITY_UNVERIFIED_NOTE };
  }
  try {
    const response = await source.fetchImpl(`${source.endpoint}?code=${encodeURIComponent(code.trim())}`);
    if (!response.ok) {
      return { verdict: 'source_unavailable', note: 'The verification service did not answer, so this medicine stays unverified.' };
    }
    const data = await response.json() as { verdict?: string; authority?: string };
    const allowed: AuthenticityVerdict[] = ['verified', 'not_found', 'recalled'];
    if (!allowed.includes(data.verdict as AuthenticityVerdict)) {
      return { verdict: 'unverified', note: 'The verification service gave no usable answer, so this medicine stays unverified.' };
    }
    const verdict = data.verdict as AuthenticityVerdict;
    const note: Record<'verified' | 'not_found' | 'recalled', string> = {
      verified: 'The official verification service confirmed this code.',
      not_found: 'The official verification service has no record of this code. Take it to a pharmacist.',
      recalled: 'The official verification service reports a recall for this code. Do not use it — speak to a pharmacist.',
    };
    return { verdict, note: note[verdict], authority: data.authority };
  } catch {
    return { verdict: 'source_unavailable', note: 'The verification service could not be reached, so this medicine stays unverified.' };
  }
}

export interface InteractionSource {
  endpoint: string;
  fetchImpl?: typeof fetch;
}

export type InteractionSeverity = 'info' | 'caution' | 'serious';

export interface InteractionFinding {
  id: string;
  severity: InteractionSeverity;
  /** The finding text — supplied by the configured source, never authored here. */
  text: string;
}

export type InteractionResult =
  | { state: 'unavailable'; note: string }
  | { state: 'checked'; findings: InteractionFinding[]; note: string };

export const INTERACTION_UNAVAILABLE_NOTE =
  'No verified interaction source is connected, so interactions were not checked. Ask a pharmacist before combining medicines.';

/**
 * Check a medicine against the medicines the person already takes, using a
 * configured VERIFIED source. With no source the result is `unavailable`; this
 * function never invents an interaction or an all-clear.
 */
export async function checkInteractions(
  input: { newMedicine: string | null; currentMedicines: string[] },
  source: InteractionSource,
): Promise<InteractionResult> {
  const current = input.currentMedicines.filter(entry => entry.trim());
  if (!input.newMedicine || input.newMedicine.trim() === '' || current.length === 0) {
    return { state: 'unavailable', note: INTERACTION_UNAVAILABLE_NOTE };
  }
  if (!source.endpoint || !source.fetchImpl) {
    return { state: 'unavailable', note: INTERACTION_UNAVAILABLE_NOTE };
  }
  try {
    const url = `${source.endpoint}?medicines=${encodeURIComponent([input.newMedicine, ...current].join(','))}`;
    const response = await source.fetchImpl(url);
    if (!response.ok) return { state: 'unavailable', note: 'The interaction source did not answer, so interactions were not checked.' };
    const data = await response.json() as { findings?: unknown };
    if (!Array.isArray(data.findings)) {
      return { state: 'unavailable', note: 'The interaction source gave no usable answer, so interactions were not checked.' };
    }
    const allowed: InteractionSeverity[] = ['info', 'caution', 'serious'];
    const findings: InteractionFinding[] = [];
    for (const entry of data.findings) {
      const finding = entry as Record<string, unknown>;
      if (typeof finding?.id !== 'string' || typeof finding?.text !== 'string') continue;
      if (!allowed.includes(finding.severity as InteractionSeverity)) continue;
      findings.push({ id: finding.id, severity: finding.severity as InteractionSeverity, text: finding.text });
    }
    return { state: 'checked', findings, note: 'Findings come from the configured interaction source. They are not a prescription decision.' };
  } catch {
    return { state: 'unavailable', note: 'The interaction source could not be reached, so interactions were not checked.' };
  }
}

/** Prefer PatientHealthContext for storage; PatientContext accepts both shapes. */
export interface PatientContext {
  allergies: ContextField | string[];
  conditions: ContextField | string[];
  currentMedicines: ContextField | string[];
  pregnantOrBreastfeeding?: boolean | null;
  isChild?: boolean;
}

export interface BeforeTakingGate {
  flags: string[];
  questions: string[];
  requiresPharmacist: boolean;
  /** True when allergies/conditions/meds were never provided. */
  insufficientPatientInformation: boolean;
}

function asField(value: ContextField | string[] | undefined): ContextField {
  if (!value) return { status: 'unknown', values: [] };
  if (Array.isArray(value)) {
    // Legacy callers passing [] meant "not wired" historically; treat as unknown.
    // Callers that mean "none" must pass { status: 'none', values: [] }.
    if (value.length === 0) return { status: 'unknown', values: [] };
    return { status: 'known', values: value.map(v => String(v).trim()).filter(Boolean) };
  }
  return value;
}

/**
 * The patient-context gate: what must be confirmed for THIS person before they
 * take THIS medicine. It asks, it never decides — no dose, no diagnosis.
 * Unknown fields are flagged; empty-legacy arrays are treated as unknown.
 */
export function buildBeforeTakingGate(input: {
  label: MedicineLabel;
  context: PatientContext;
  interactions?: InteractionResult;
}): BeforeTakingGate {
  const { label, context } = input;
  const allergies = asField(context.allergies);
  const conditions = asField(context.conditions);
  const current = asField(context.currentMedicines);

  const flags: string[] = [];
  const questions: string[] = [
    'Has a pharmacist or clinician confirmed this is the right medicine and strength for you?',
    'Have you taken this medicine before, and did you have any reaction?',
  ];

  let insufficientPatientInformation = false;

  if (allergies.status === 'unknown') {
    insufficientPatientInformation = true;
    flags.push('Allergies are not provided. Do not assume you have none — tell VEEDA, or ask a pharmacist.');
    questions.push('Do you have any medicine allergies?');
  } else if (allergies.status === 'known' && allergies.values.length) {
    flags.push(`You recorded allergies: ${allergies.values.join('; ')}. A pharmacist must check this medicine against them.`);
    questions.push('Do any of my recorded allergies matter for this medicine?');
  }

  if (conditions.status === 'unknown') {
    insufficientPatientInformation = true;
    flags.push('Health conditions are not provided. Do not assume none are relevant.');
    questions.push('Do you have any conditions a pharmacist should know about for this medicine?');
  } else if (conditions.status === 'known' && conditions.values.length) {
    flags.push(`You recorded conditions: ${conditions.values.join('; ')}. A pharmacist must check this medicine against them.`);
    questions.push('Do any of my recorded conditions matter for this medicine?');
  }

  if (current.status === 'unknown') {
    insufficientPatientInformation = true;
    flags.push('Current medicines are not provided. Do not assume you take nothing else.');
    questions.push('What other medicines are you taking right now?');
  } else if (current.status === 'known' && current.values.length) {
    flags.push('You are already taking other medicines. They must be checked for interactions.');
    questions.push('Could this interact with the medicines I already take?');
  }

  if (context.isChild) {
    flags.push('This profile is a child or of unknown age. Children\u2019s dosing differs and adult guidance does not apply.');
    questions.push('Is this medicine suitable for this child, and at what dose?');
  }

  if (context.pregnantOrBreastfeeding === true) {
    flags.push('Pregnancy or breastfeeding was reported. A clinician must confirm before use.');
    questions.push('Is this medicine safe in pregnancy or while breastfeeding?');
  } else if (context.pregnantOrBreastfeeding === null || context.pregnantOrBreastfeeding === undefined) {
    questions.push('Could you be pregnant or breastfeeding?');
  }

  if (!label.name || !label.strength) {
    flags.push('The name or strength could not be read from the package, so it cannot be safely identified from the photo alone.');
    questions.push('Can you identify this medicine from the package I bring you?');
  }

  const interactions = input.interactions;
  if (interactions?.state === 'checked' && interactions.findings.some(finding => finding.severity !== 'info')) {
    flags.push('The interaction check returned findings that need a pharmacist\u2019s review.');
    questions.push('What should I do about the interactions that were found?');
  }
  if (interactions?.state === 'unavailable') {
    flags.push('Interaction information is unavailable — that is not the same as safe.');
  }

  return {
    flags,
    questions,
    requiresPharmacist: flags.length > 0 || insufficientPatientInformation,
    insufficientPatientInformation,
  };
}

/** Distinct UI concepts — never collapse identity into authenticity. */
export type MedicineUiState =
  | 'verified_drug_information'
  | 'identity_found_authenticity_not_established'
  | 'unable_to_verify'
  | 'insufficient_patient_information'
  | 'interaction_information_unavailable'
  | 'professional_review_recommended'
  | 'awaiting_confirmation';

export interface DrugKnowledgeResult {
  identity_match: boolean;
  drug_information_available: boolean;
  interaction_information_available: boolean;
  regulatory_verification: { state: string; authority: string | null; note: string };
  physical_authenticity: { state: string; note: string };
  active_ingredient: string | null;
  rxcui: string | null;
  note: string;
  openfda?: unknown;
}

export interface InteractionAssessment {
  state: 'checked' | 'unavailable' | 'insufficient_information';
  findings: InteractionFinding[];
  note: string;
  ui_state: MedicineUiState | 'checked_no_pairs_found';
  safe: false;
}

export function deriveMedicineUiState(input: {
  knowledge: DrugKnowledgeResult | null;
  interactions: InteractionAssessment | null;
  patient: PatientHealthContext;
  labelConfirmed: boolean;
}): MedicineUiState {
  if (!input.labelConfirmed) return 'awaiting_confirmation';
  if (hasUnknownMedicineContext(input.patient)) return 'insufficient_patient_information';
  if (input.interactions?.state === 'insufficient_information') return 'insufficient_patient_information';
  if (input.interactions?.state === 'unavailable') return 'interaction_information_unavailable';
  if (input.interactions?.findings.some(f => f.severity === 'serious' || f.severity === 'caution')) {
    return 'professional_review_recommended';
  }
  if (!input.knowledge) return 'unable_to_verify';
  if (!input.knowledge.identity_match) return 'unable_to_verify';
  if (input.knowledge.physical_authenticity.state !== 'regulator_confirmed_code') {
    return 'identity_found_authenticity_not_established';
  }
  return 'verified_drug_information';
}

export function medicineUiStateLabel(state: MedicineUiState): string {
  switch (state) {
    case 'verified_drug_information':
      return 'Verified drug information available';
    case 'identity_found_authenticity_not_established':
      return 'Identity found — package authenticity not established';
    case 'unable_to_verify':
      return 'Unable to verify';
    case 'insufficient_patient_information':
      return 'Insufficient patient information';
    case 'interaction_information_unavailable':
      return 'Interaction information unavailable';
    case 'professional_review_recommended':
      return 'Professional review recommended';
    case 'awaiting_confirmation':
      return 'Confirm the package details';
  }
}

/** A single daily dose time in a plan. */
export interface Dose {
  id: string;
  /** 24-hour "HH:MM". */
  time: string;
}

export interface MedicationPlan {
  id: string;
  /** Neutral label when the user opted not to store a medicine name. */
  label: string;
  doses: Dose[];
  /** YYYY-MM-DD the plan starts. */
  startDate: string;
  createdAt: string;
}

/** A plan keeps the user's chosen label; an empty one becomes a neutral label. */
export function planLabel(input: string | null | undefined): string {
  const value = (input ?? '').trim();
  return value === '' ? NEUTRAL_FALLBACK_LABEL : value;
}

export interface AdherenceRecord {
  planId: string;
  doseId: string;
  /** YYYY-MM-DD the dose belongs to. */
  date: string;
  taken: boolean;
  recordedAt: string;
}

function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/** Create a plan from chosen dose times. Invalid times are dropped, not guessed. */
export function createMedicationPlan(input: {
  id: string;
  label?: string | null;
  times: string[];
  startDate: string;
  createdAt: string;
}): MedicationPlan {
  const doses: Dose[] = input.times
    .filter(isValidTime)
    .map((time, index) => ({ id: `${input.id}-dose-${index + 1}`, time }));
  return { id: input.id, label: planLabel(input.label), doses, startDate: input.startDate, createdAt: input.createdAt };
}

export interface DueDose extends Dose {
  /** True when the time has passed and no record says it was taken. */
  overdue: boolean;
}

/**
 * Today's doses for a plan, each marked overdue once its time has passed and it
 * is not recorded as taken. Only the plan's own times are used — no schedule is
 * invented here.
 */
export function dosesDueFor(
  plan: MedicationPlan,
  date: string,
  records: AdherenceRecord[],
  now: Date,
): DueDose[] {
  return plan.doses.map(dose => {
    const taken = records.some(r => r.planId === plan.id && r.doseId === dose.id && r.date === date && r.taken);
    const [hours, minutes] = dose.time.split(':').map(Number);
    const dueAt = new Date(now);
    dueAt.setHours(hours, minutes, 0, 0);
    return { ...dose, overdue: !taken && dueAt.getTime() < now.getTime() };
  });
}

export interface AdherenceSummary {
  scheduled: number;
  taken: number;
  /** Null when nothing was scheduled, so a rate is never shown as 0% by accident. */
  rate: number | null;
}

/** Taken / scheduled over the plan's recorded days. Says nothing when empty. */
export function adherenceSummary(plan: MedicationPlan, records: AdherenceRecord[]): AdherenceSummary {
  const forPlan = records.filter(r => r.planId === plan.id);
  const days = new Set(forPlan.map(r => r.date));
  const scheduled = plan.doses.length * days.size;
  const taken = forPlan.filter(r => r.taken).length;
  return { scheduled, taken, rate: scheduled === 0 ? null : taken / scheduled };
}

/**
 * Record a dose. Returns the new record list; taking the same dose twice for the
 * same day overwrites rather than double-counts.
 */
export function recordDose(
  records: AdherenceRecord[],
  input: { planId: string; doseId: string; date: string; taken: boolean; recordedAt: string },
): AdherenceRecord[] {
  const rest = records.filter(r => !(r.planId === input.planId && r.doseId === input.doseId && r.date === input.date));
  return [...rest, { ...input }];
}
