// Blood pressure and glucose logging.
//
// These are the user's own readings. This module stores the unit with every
// reading and never converts or guesses it. It rejects impossible values with a
// neutral "check this value" message and NEVER labels a value high or low —
// that would be a clinical judgement we are not making here. Each reading also
// records whether it was typed in or came from a device, plus a timestamp, so
// exports are trustworthy. Pure functions keep this testable without a browser.
//
// Sensor Hub bridge: readings saved here are also surfaced to the VEEDA Sensor
// Hub (sensorHub.ts) so the reasoning/chat layer can see them. The hub is a
// runtime singleton, so this import is deferred to the bridge function to keep
// this module pure and testable without a browser.

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type TemperatureUnit = '°C' | '°F';
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

export interface TemperatureReading {
  kind: 'body_temperature';
  value: number;
  unit: TemperatureUnit;
  source: ReadingSource;
  recordedAt: string;
}

export type Reading = BloodPressureReading | GlucoseReading | TemperatureReading;

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

// Body-temperature plausibility bounds only.
const TEMP_RANGE: Record<TemperatureUnit, { min: number; max: number }> = {
  '°C': { min: 25, max: 45 },
  '°F': { min: 77, max: 113 },
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

  if (reading.kind === 'body_temperature') {
    const range = TEMP_RANGE[reading.unit];
    if (!range) return { ok: false, message: CHECK_VALUE_MESSAGE };
    if (!Number.isFinite(reading.value) || reading.value < range.min || reading.value > range.max) {
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
  kind: 'blood_pressure' | 'blood_glucose' | 'body_temperature';
  systolic?: number;
  diastolic?: number;
  value?: number;
  unit?: GlucoseUnit | TemperatureUnit;
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
  } else if (input.kind === 'body_temperature') {
    if (input.unit !== '°C' && input.unit !== '°F') {
      return { ok: false, message: CHECK_VALUE_MESSAGE };
    }
    reading = {
      kind: 'body_temperature',
      value: Number(input.value),
      unit: input.unit,
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

export interface TemperatureTrend {
  count: number;
  average: number | null;
  unit: TemperatureUnit;
  latest: TemperatureReading | null;
}

export function temperatureTrend(readings: Reading[], unit: TemperatureUnit): TemperatureTrend {
  // Only average within a single unit; never mix °C and °F.
  const temps = readings.filter(
    (r): r is TemperatureReading => r.kind === 'body_temperature' && r.unit === unit,
  );
  if (temps.length === 0) return { count: 0, average: null, unit, latest: null };
  const average = temps.reduce((sum, r) => sum + r.value, 0) / temps.length;
  const latest = [...temps].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  return { count: temps.length, average: Math.round(average * 10) / 10, unit, latest };
}

const CSV_HEADER = 'kind,value,systolic,diastolic,unit,context,source,recorded_at';

export function buildReadingsCsv(readings: Reading[]): string {
  const rows = readings.map((r) => {
    if (r.kind === 'blood_pressure') {
      return ['blood_pressure', '', r.systolic, r.diastolic, 'mmHg', '', r.source, r.recordedAt].join(',');
    }
    if (r.kind === 'body_temperature') {
      return ['body_temperature', r.value, '', '', r.unit, '', r.source, r.recordedAt].join(',');
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

/**
 * Download this user's on-device readings as a CSV, if there are any.
 *
 * The `download` callback is injected (rather than a blob/anchor touched here)
 * so this stays a pure, testable function with no DOM dependency. Returns the
 * number of readings written, so a caller can tell the difference between
 * "exported N readings" and "there was nothing to export".
 */
export function downloadReadingsCsv(
  storage: StorageLike,
  userId: string,
  download: (filename: string, csv: string) => void,
  generatedAt: string,
): number {
  const readings = loadReadings(storage, userId);
  if (readings.length === 0) return 0;
  download(readingsFilename(generatedAt), buildReadingsCsv(readings));
  return readings.length;
}

/**
 * Push a validated reading into the VEEDA Sensor Hub so the reasoning / chat
 * layer can see it.
 *
 * The hub is injected rather than imported directly so this module stays pure
 * and testable without a browser environment (no `require`/dynamic import).
 * Callers that have no hub (e.g. unit tests) may pass `null` and the call is a
 * safe no-op.
 *
 * - `source` is mapped honestly: 'device' → EXTERNAL_DEVICE, 'typed_in' → MANUAL.
 * - Quality is GOOD for device readings (direct measurement) and WEAK for
 *   typed-in values (human entry, possible transcription error — never claimed
 *   to be a sensor measurement).
 * - Never invents a reading; only called after a successful validation.
 */
export function pushReadingToHub(
  reading: Reading,
  hub: { add: (r: NormalizedHubReading) => void } | null,
): void {
  if (!hub) return;
  const source = reading.source === 'device' ? 'EXTERNAL_DEVICE' : 'MANUAL';
  const quality = reading.source === 'device' ? 'GOOD' : 'WEAK';

  if (reading.kind === 'blood_pressure') {
    hub.add({
      capabilityId: 'ble_blood_pressure',
      measurementType: 'blood_pressure',
      value: JSON.stringify({ systolic: reading.systolic, diastolic: reading.diastolic }),
      unit: 'mmHg',
      source,
      timestamp: reading.recordedAt,
      freshness: 0,
      quality,
      description: reading.source === 'device' ? 'Bluetooth blood pressure device' : 'Manually entered blood pressure',
    });
  } else if (reading.kind === 'body_temperature') {
    hub.add({
      capabilityId: 'ble_body_temperature',
      measurementType: 'body_temperature',
      value: reading.value,
      unit: reading.unit,
      source,
      timestamp: reading.recordedAt,
      freshness: 0,
      quality,
      description: reading.source === 'device' ? 'Bluetooth thermometer' : 'Manually entered body temperature',
    });
  } else {
    hub.add({
      capabilityId: 'ble_blood_glucose',
      measurementType: 'blood_glucose',
      value: reading.value,
      unit: reading.unit,
      source,
      timestamp: reading.recordedAt,
      freshness: 0,
      quality,
      description: reading.source === 'device' ? 'Bluetooth glucose meter' : 'Manually entered blood glucose',
    });
  }
}

/**
 * Minimal shape of the hub this module needs. Kept narrow so bpGlucose stays
 * decoupled from the concrete SensorHub class.
 */
export interface NormalizedHubReading {
  capabilityId: string;
  measurementType: string;
  value: number | string;
  unit: string;
  source: string;
  timestamp: string;
  freshness: number;
  quality: string;
  description?: string;
}

/**
 * Append a reading to storage AND surface it to the Sensor Hub. Convenience
 * wrapper around addReading so callers do not need to remember both steps.
 */
export function addReadingAndHub(
  storage: StorageLike,
  userId: string,
  reading: Reading,
  hub: { add: (r: NormalizedHubReading) => void } | null,
): ValidationResult {
  const result = addReading(storage, userId, reading);
  if (result.ok) {
    pushReadingToHub(reading, hub);
  }
  return result;
}

/**
 * Re-surface already-stored readings into the hub. Useful on app load so the
 * reasoning layer has context without requiring a fresh measurement.
 */
export function syncStoredReadingsToHub(readings: Reading[], hub: { add: (r: NormalizedHubReading) => void } | null): void {
  for (const r of readings) pushReadingToHub(r, hub);
}
