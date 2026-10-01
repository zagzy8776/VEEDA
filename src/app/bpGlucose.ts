// Blood pressure and glucose logging.
//
// These are the user's own readings. This module stores the unit with every
// reading and never converts or guesses it. It rejects impossible values with a
// neutral "check this value" message and NEVER labels a value high or low —
// that would be a clinical judgement we are not making here. Each reading also
// records whether it was typed in or came from a device, plus a timestamp, so
// exports are trustworthy. Pure functions keep this testable without a browser.

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type ReadingSource = 'typed_in' | 'device';

export interface BloodPressureReading {
  kind: 'blood_pressure';
  systolic: number;
  diastolic: number;
  source: ReadingSource;
  recordedAt: string;
}

export interface GlucoseReading {
  kind: 'blood_glucose';
  value: number;
  unit: GlucoseUnit;
  /** Optional meal context. Absent means the user did not tag it. */
  context?: 'fasting' | 'after_meal';
  source: ReadingSource;
  recordedAt: string;
}

export type Reading = BloodPressureReading | GlucoseReading;

export interface ValidationResult {
  ok: boolean;
  /** Neutral, non-clinical correction prompt. Never says high or low. */
  message?: string;
}

export const CHECK_VALUE_MESSAGE = 'Check this value — it looks like it may be a typo.';

/** Honest storage-limits note shown on the BP/glucose screen. */
export const DEVICE_ONLY_NOTE = 'Stored on this device only. Export to keep a copy.';

// Plausibility bounds only. These catch typos (e.g. 1200, or 12.0 in the wrong
// unit); they deliberately do NOT encode any clinical threshold. Whether a
// value is "high" or "low" is a clinical judgement this app does not make.
const GLUCOSE_RANGE: Record<GlucoseUnit, { min: number; max: number }> = {
  'mg/dL': { min: 20, max: 600 },
  'mmol/L': { min: 1, max: 40 },
};

export function validateReading(reading: Reading): ValidationResult {
  if (reading.kind === 'blood_pressure') {
    const { systolic, diastolic } = reading;
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
      return { ok: false, message: CHECK_VALUE_MESSAGE };
    }
    // A diastolic at or above the systolic is almost always a swap or typo.
    if (systolic <= 0 || diastolic <= 0 || systolic <= diastolic) {
      return { ok: false, message: CHECK_VALUE_MESSAGE };
    }
    if (systolic > 400 || diastolic > 300) {
      return { ok: false, message: CHECK_VALUE_MESSAGE };
    }
    return { ok: true };
  }

  const range = GLUCOSE_RANGE[reading.unit];
  if (!range) {
    // An unknown unit must never be silently accepted.
    return { ok: false, message: CHECK_VALUE_MESSAGE };
  }
  if (!Number.isFinite(reading.value) || reading.value < range.min || reading.value > range.max) {
    return { ok: false, message: CHECK_VALUE_MESSAGE };
  }
  return { ok: true };
}

export interface ValidationOutcome {
  ok: boolean;
  message?: string;
  reading?: Reading;
}

/**
 * Parse and validate a raw entry. The unit is taken from the input as-is and
 * never inferred from the number, so "12.0" is never quietly treated as mmol/L.
 */
export function parseReading(input: {
  kind: 'blood_pressure' | 'blood_glucose';
  systolic?: number;
  diastolic?: number;
  value?: number;
  unit?: GlucoseUnit;
  context?: 'fasting' | 'after_meal';
  source?: ReadingSource;
  recordedAt: string;
}): ValidationOutcome {
  const source: ReadingSource = input.source === 'device' ? 'device' : 'typed_in';
  let reading: Reading;
  if (input.kind === 'blood_pressure') {
    reading = {
      kind: 'blood_pressure',
      systolic: Number(input.systolic),
      diastolic: Number(input.diastolic),
      source,
      recordedAt: input.recordedAt,
    };
  } else {
    if (input.unit !== 'mg/dL' && input.unit !== 'mmol/L') {
      return { ok: false, message: CHECK_VALUE_MESSAGE };
    }
    reading = {
      kind: 'blood_glucose',
      value: Number(input.value),
      unit: input.unit,
      context: input.context,
      source,
      recordedAt: input.recordedAt,
    };
  }
  const result = validateReading(reading);
  if (result.ok === false) return { ok: false, message: result.message };
  return { ok: true, reading };
}

function storageKey(userId: string): string {
  return `veda_bp_glucose_${userId}`;
}

/** The localStorage key that holds this user's blood pressure / glucose log. */
export function readingsStorageKey(userId: string): string {
  return storageKey(userId);
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadReadings(storage: StorageLike, userId: string): Reading[] {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reading[]) : [];
  } catch {
    return [];
  }
}

/** Append a reading. Invalid readings are rejected, never stored. */
export function addReading(storage: StorageLike, userId: string, reading: Reading): ValidationResult {
  const result = validateReading(reading);
  if (result.ok === false) return result;
  const readings = loadReadings(storage, userId);
  readings.push(reading);
  try {
    storage.setItem(storageKey(userId), JSON.stringify(readings));
  } catch {
    return { ok: false, message: 'The reading could not be saved on this device.' };
  }
  return { ok: true };
}

export interface BpTrend {
  count: number;
  averageSystolic: number | null;
  averageDiastolic: number | null;
  latest: BloodPressureReading | null;
}

export interface GlucoseTrend {
  count: number;
  average: number | null;
  unit: GlucoseUnit;
  latest: GlucoseReading | null;
}

// Trends are descriptive averages only. No target, no "in range", no category.
export function bpTrend(readings: Reading[]): BpTrend {
  const bp = readings.filter((r): r is BloodPressureReading => r.kind === 'blood_pressure');
  if (bp.length === 0) return { count: 0, averageSystolic: null, averageDiastolic: null, latest: null };
  const avgSys = bp.reduce((sum, r) => sum + r.systolic, 0) / bp.length;
  const avgDia = bp.reduce((sum, r) => sum + r.diastolic, 0) / bp.length;
  const latest = [...bp].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  return { count: bp.length, averageSystolic: Math.round(avgSys), averageDiastolic: Math.round(avgDia), latest };
}

export function glucoseTrend(readings: Reading[], unit: GlucoseUnit): GlucoseTrend {
  // Only average within a single unit; mixing mg/dL and mmol/L would be wrong.
  const glucose = readings.filter(
    (r): r is GlucoseReading => r.kind === 'blood_glucose' && r.unit === unit,
  );
  if (glucose.length === 0) return { count: 0, average: null, unit, latest: null };
  const average = glucose.reduce((sum, r) => sum + r.value, 0) / glucose.length;
  const latest = [...glucose].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  return { count: glucose.length, average: Math.round(average * 10) / 10, unit, latest };
}

const CSV_HEADER = 'kind,value,systolic,diastolic,unit,context,source,recorded_at';

export function buildReadingsCsv(readings: Reading[]): string {
  const rows = readings.map((r) => {
    if (r.kind === 'blood_pressure') {
      return ['blood_pressure', '', r.systolic, r.diastolic, 'mmHg', '', r.source, r.recordedAt].join(',');
    }
    return ['blood_glucose', r.value, '', '', r.unit, r.context ?? '', r.source, r.recordedAt].join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}

export function readingsFilename(generatedAt: string): string {
  const date = new Date(generatedAt);
  const stamp = Number.isNaN(date.getTime()) ? 'export' : date.toISOString().slice(0, 10);
  return `bp-glucose-${stamp}.csv`;
}

