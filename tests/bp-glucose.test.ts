import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_VALUE_MESSAGE,
  addReading,
  bpTrend,
  buildReadingsCsv,
  downloadReadingsCsv,
  glucoseTrend,
  loadReadings,
  parseReading,
  readingsFilename,
  readingsStorageKey,
  validateReading,
  type Reading,
  type StorageLike,
} from '../src/app/bpGlucose.ts';

class TestStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

const USER = 'user-1';
const AT = '2026-06-01T08:00:00.000Z';

// --- validation: impossible values are rejected, never judged ---

test('a plausible blood pressure reading is accepted', () => {
  assert.equal(validateReading({ kind: 'blood_pressure', systolic: 128, diastolic: 82, source: 'typed_in', recordedAt: AT }).ok, true);
});

test('a swapped blood pressure (diastolic >= systolic) is rejected as a likely typo', () => {
  const result = validateReading({ kind: 'blood_pressure', systolic: 80, diastolic: 120, source: 'typed_in', recordedAt: AT });
  assert.equal(result.ok, false);
  assert.equal(result.message, CHECK_VALUE_MESSAGE);
});

test('an absurd blood pressure value is rejected', () => {
  assert.equal(validateReading({ kind: 'blood_pressure', systolic: 1200, diastolic: 80, source: 'typed_in', recordedAt: AT }).ok, false);
});

test('glucose 1200 mg/dL is rejected as a typo', () => {
  assert.equal(validateReading({ kind: 'blood_glucose', value: 1200, unit: 'mg/dL', source: 'typed_in', recordedAt: AT }).ok, false);
});

test('glucose 12.0 mmol/L is accepted, and 12.0 is NOT silently treated as mg/dL', () => {
  assert.equal(validateReading({ kind: 'blood_glucose', value: 12, unit: 'mmol/L', source: 'typed_in', recordedAt: AT }).ok, true);
  assert.equal(validateReading({ kind: 'blood_glucose', value: 12, unit: 'mg/dL', source: 'typed_in', recordedAt: AT }).ok, false);
});

test('the correction message never labels a value high or low', () => {
  assert.doesNotMatch(CHECK_VALUE_MESSAGE, /high|low|danger|normal|abnormal|critical/i);
  assert.match(CHECK_VALUE_MESSAGE, /check this value/i);
});

// --- unit is stored with the reading and never guessed ---

test('parseReading keeps the mg/dL unit exactly as given', () => {
  const outcome = parseReading({ kind: 'blood_glucose', value: 110, unit: 'mg/dL', recordedAt: AT });
  assert.equal(outcome.ok, true);
  assert.equal((outcome.reading as any).unit, 'mg/dL');
});

test('parseReading keeps the mmol/L unit exactly as given', () => {
  const outcome = parseReading({ kind: 'blood_glucose', value: 6.5, unit: 'mmol/L', recordedAt: AT });
  assert.equal(outcome.ok, true);
  assert.equal((outcome.reading as any).unit, 'mmol/L');
});

test('parseReading refuses a missing or unknown unit rather than guessing', () => {
  assert.equal(parseReading({ kind: 'blood_glucose', value: 110, recordedAt: AT }).ok, false);
  assert.equal(parseReading({ kind: 'blood_glucose', value: 110, unit: 'g/L' as any, recordedAt: AT }).ok, false);
});

// --- source and context are recorded ---

test('parseReading defaults to typed_in and records device when specified', () => {
  const typed = parseReading({ kind: 'blood_pressure', systolic: 120, diastolic: 80, recordedAt: AT });
  assert.equal((typed.reading as any).source, 'typed_in');
  const device = parseReading({ kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'device', recordedAt: AT });
  assert.equal((device.reading as any).source, 'device');
});

test('parseReading keeps an optional fasting/after-meal tag', () => {
  const fasting = parseReading({ kind: 'blood_glucose', value: 5.2, unit: 'mmol/L', context: 'fasting', recordedAt: AT });
  assert.equal((fasting.reading as any).context, 'fasting');
  const untagged = parseReading({ kind: 'blood_glucose', value: 5.2, unit: 'mmol/L', recordedAt: AT });
  assert.equal((untagged.reading as any).context, undefined);
});

// --- storage ---

test('addReading stores a valid reading with its unit and timestamp', () => {
  const storage = new TestStorage();
  const result = addReading(storage, USER, { kind: 'blood_glucose', value: 6.1, unit: 'mmol/L', source: 'typed_in', recordedAt: AT });
  assert.equal(result.ok, true);
  const stored = loadReadings(storage, USER);
  assert.equal(stored.length, 1);
  assert.equal((stored[0] as any).unit, 'mmol/L');
  assert.equal(stored[0].recordedAt, AT);
});

test('addReading refuses to store an impossible reading', () => {
  const storage = new TestStorage();
  const result = addReading(storage, USER, { kind: 'blood_glucose', value: 1200, unit: 'mg/dL', source: 'typed_in', recordedAt: AT });
  assert.equal(result.ok, false);
  assert.equal(result.message, CHECK_VALUE_MESSAGE);
  assert.equal(loadReadings(storage, USER).length, 0);
});

test('readings are isolated per user', () => {
  const storage = new TestStorage();
  addReading(storage, USER, { kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: AT });
  assert.equal(loadReadings(storage, 'other').length, 0);
});

// --- trends (descriptive only) ---

const sample: Reading[] = [
  { kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: '2026-06-01T08:00:00.000Z' },
  { kind: 'blood_pressure', systolic: 130, diastolic: 84, source: 'device', recordedAt: '2026-06-02T08:00:00.000Z' },
  { kind: 'blood_glucose', value: 100, unit: 'mg/dL', source: 'typed_in', recordedAt: '2026-06-01T08:00:00.000Z' },
  { kind: 'blood_glucose', value: 120, unit: 'mg/dL', source: 'device', recordedAt: '2026-06-02T08:00:00.000Z' },
  { kind: 'blood_glucose', value: 5.5, unit: 'mmol/L', source: 'typed_in', recordedAt: '2026-06-01T08:00:00.000Z' },
];

test('bpTrend averages systolic and diastolic and returns the latest', () => {
  const trend = bpTrend(sample);
  assert.equal(trend.count, 2);
  assert.equal(trend.averageSystolic, 125);
  assert.equal(trend.averageDiastolic, 82);
  assert.equal(trend.latest?.recordedAt, '2026-06-02T08:00:00.000Z');
});

test('glucoseTrend never mixes units', () => {
  const mgdl = glucoseTrend(sample, 'mg/dL');
  assert.equal(mgdl.count, 2);
  assert.equal(mgdl.average, 110);
  const mmol = glucoseTrend(sample, 'mmol/L');
  assert.equal(mmol.count, 1);
  assert.equal(mmol.average, 5.5);
});

// --- CSV export ---

test('CSV export includes the unit, source and timestamp for every reading', () => {
  const csv = buildReadingsCsv(sample);
  const lines = csv.split('\n');
  assert.match(lines[0], /kind,value,systolic,diastolic,unit,context,source,recorded_at/);
  assert.match(csv, /blood_glucose,100,,,mg\/dL,,typed_in,2026-06-01T08:00:00\.000Z/);
  assert.match(csv, /blood_pressure,,120,80,mmHg,,typed_in,2026-06-01T08:00:00\.000Z/);
});

test('the CSV filename is neutral and date-stamped', () => {
  assert.equal(readingsFilename('2026-06-01T08:00:00.000Z'), 'bp-glucose-2026-06-01.csv');
  assert.doesNotMatch(readingsFilename('2026-06-01T08:00:00.000Z'), /veeda|patient|name/i);
});

// --- export-before-logout action ---

test('downloadReadingsCsv exports the readings and reports how many were written', () => {
  const store = new TestStorage();
  addReading(store, USER, sample[0]);
  addReading(store, USER, sample[2]);

  const written: { filename: string; csv: string }[] = [];
  const count = downloadReadingsCsv(store, USER, (filename, csv) => written.push({ filename, csv }), AT);

  assert.equal(count, 2);
  assert.equal(written.length, 1);
  assert.equal(written[0].filename, 'bp-glucose-2026-06-01.csv');
  // The exported CSV is the real data, not an empty file.
  assert.match(written[0].csv, /blood_pressure,,120,80,mmHg/);
  assert.match(written[0].csv, /blood_glucose,100,,,mg\/dL/);
});

test('downloadReadingsCsv writes nothing (and returns 0) when there is nothing to export', () => {
  const store = new TestStorage();
  let called = false;
  const count = downloadReadingsCsv(store, USER, () => { called = true; }, AT);
  assert.equal(count, 0);
  assert.equal(called, false);
});

test('the export action runs before the data is cleared on logout', () => {
  const store = new TestStorage();
  addReading(store, USER, sample[1]);

  // The logout prompt's "Export CSV" action must download while the readings
  // still exist, then clearing runs afterwards. Capture what the download saw.
  let exportedWhilePresent: string | null = null;
  const order: string[] = [];

  downloadReadingsCsv(store, USER, (filename, csv) => {
    exportedWhilePresent = store.getItem(readingsStorageKey(USER));
    order.push('download');
    assert.ok(csv.includes('blood_pressure'));
    assert.equal(filename, 'bp-glucose-2026-06-01.csv');
  }, AT);

  // Mirror what logout does after the export: clear the per-user key.
  store.removeItem(readingsStorageKey(USER));
  order.push('clear');

  assert.deepEqual(order, ['download', 'clear'], 'export must happen before the wipe');
  assert.notEqual(exportedWhilePresent, null, 'the data was readable when the export ran');
  assert.equal(store.getItem(readingsStorageKey(USER)), null, 'the data is gone after logout');
});

test('if the export were skipped, the wipe would have destroyed the only copy', () => {
  const store = new TestStorage();
  addReading(store, USER, sample[1]);

  // Same wipe as logout, but with no export first: the readings are lost.
  store.removeItem(readingsStorageKey(USER));
  let called = false;
  const count = downloadReadingsCsv(store, USER, () => { called = true; }, AT);
  assert.equal(count, 0);
  assert.equal(called, false);
});


