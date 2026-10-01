/**
 * Server-side plausibility checks for synced BP/glucose readings.
 *
 * These mirror the client's `validateReading` in src/app/bpGlucose.ts. The
 * server repeats them because a client cannot be trusted: a value that is
 * impossible (e.g. a diastolic above the systolic, or a glucose of 1200) must be
 * rejected here too. They are plausibility bounds only and encode no clinical
 * threshold — the app never decides whether a value is "high" or "low".
 */

// Same bounds as the client's GLUCOSE_RANGE.
const GLUCOSE_RANGE = {
  'mg/dL': { min: 20, max: 600 },
  'mmol/L': { min: 1, max: 40 },
};

const SOURCES = new Set(['typed_in', 'device']);
const CONTEXTS = new Set(['fasting', 'after_meal']);

export function validateReadingInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, message: 'invalid reading' };
  if (typeof input.clientId !== 'string' || !input.clientId.trim()) {
    return { ok: false, message: 'clientId is required' };
  }
  if (!SOURCES.has(input.source)) return { ok: false, message: 'invalid source' };
  if (typeof input.recordedAt !== 'string' || Number.isNaN(Date.parse(input.recordedAt))) {
    return { ok: false, message: 'invalid recordedAt' };
  }
  if (input.context != null && !CONTEXTS.has(input.context)) {
    return { ok: false, message: 'invalid context' };
  }

  if (input.kind === 'blood_pressure') {
    const { systolic, diastolic } = input;
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
      return { ok: false, message: 'check this value' };
    }
    if (systolic <= 0 || diastolic <= 0 || systolic <= diastolic) {
      return { ok: false, message: 'check this value' };
    }
    if (systolic > 400 || diastolic > 300) return { ok: false, message: 'check this value' };
    return { ok: true };
  }

  if (input.kind === 'blood_glucose') {
    const range = GLUCOSE_RANGE[input.unit];
    if (!range) return { ok: false, message: 'invalid unit' };
    if (!Number.isFinite(input.value) || input.value < range.min || input.value > range.max) {
      return { ok: false, message: 'check this value' };
    }
    return { ok: true };
  }

  return { ok: false, message: 'invalid kind' };
}

/**
 * Normalize a validated reading into the row shape `readings` stores. The unit
 * is taken as sent and never inferred from the number.
 */
export function toRow(input) {
  if (input.kind === 'blood_pressure') {
    return {
      kind: 'blood_pressure',
      systolic: input.systolic,
      diastolic: input.diastolic,
      value: null,
      unit: 'mmHg',
      context: null,
    };
  }
  return {
    kind: 'blood_glucose',
    systolic: null,
    diastolic: null,
    value: input.value,
    unit: input.unit,
    context: input.context ?? null,
  };
}
