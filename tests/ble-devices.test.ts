import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUETOOTH_UNSUPPORTED_NOTE,
  bluetoothSupport,
  decodeFloat32Ieee11073,
  decodeSfloat16,
  parseBloodPressureMeasurement,
  parseGlucoseMeasurement,
  parseTemperatureMeasurement,
} from '../src/app/bleDevices.ts';

/** Build a DataView from a list of byte values. */
function bytes(...values: number[]): DataView {
  return new DataView(new Uint8Array(values).buffer);
}

/**
 * Encode a 16-bit SFLOAT the way a device sends it: signed 12-bit mantissa in
 * the high bits, signed 4-bit exponent in the low nibble, little-endian.
 */
function sfloat16Bytes(mantissa: number, exponent: number): [number, number] {
  const m = mantissa & 0xfff;
  const e = exponent & 0xf;
  const raw = ((m << 4) | e) & 0xffff;
  return [raw & 0xff, (raw >> 8) & 0xff];
}

// ── SFLOAT (16-bit) ──

test('a 16-bit SFLOAT decodes a plain 120 with exponent 0', () => {
  const [lo, hi] = sfloat16Bytes(120, 0);
  assert.equal(decodeSfloat16(bytes(lo, hi), 0), 120);
});

test('a 16-bit SFLOAT honours a negative exponent (1200 × 10⁻¹ = 120)', () => {
  const [lo, hi] = sfloat16Bytes(1200, -1);
  assert.equal(decodeSfloat16(bytes(lo, hi), 0), 120);
});

test('a 16-bit SFLOAT decodes a negative mantissa', () => {
  const [lo, hi] = sfloat16Bytes(-5, 0);
  assert.equal(decodeSfloat16(bytes(lo, hi), 0), -5);
});

test('the reserved 16-bit SFLOAT values are not treated as numbers', () => {
  assert.ok(Number.isNaN(decodeSfloat16(bytes(0xff, 0x07), 0))); // NaN
  assert.ok(Number.isNaN(decodeSfloat16(bytes(0x00, 0x08), 0))); // NRes
  assert.ok(Number.isNaN(decodeSfloat16(bytes(0xfe, 0x07), 0))); // +INF
});

// ── IEEE-11073 32-bit FLOAT ──

test('an IEEE-11073 32-bit FLOAT decodes 37.2 °C (372 × 10⁻¹)', () => {
  assert.equal(decodeFloat32Ieee11073(bytes(0x74, 0x01, 0x00, 0xff), 0), 37.2);
});

test('an IEEE-11073 32-bit FLOAT decodes a negative value', () => {
  // -37 → mantissa -37, exponent 0.
  const m = 0x1000000 - 37;
  const view = bytes(m & 0xff, (m >> 8) & 0xff, (m >> 16) & 0xff, 0x00);
  assert.equal(decodeFloat32Ieee11073(view, 0), -37);
});

// ── Blood Pressure Measurement (0x2A35) ──

test('a blood-pressure measurement decodes 120/80 in mmHg', () => {
  const sys = sfloat16Bytes(120, 0);
  const dia = sfloat16Bytes(80, 0);
  const map = sfloat16Bytes(93, 0);
  const decoded = parseBloodPressureMeasurement(bytes(0x00, ...sys, ...dia, ...map));
  assert.ok(decoded);
  assert.equal(decoded.systolic, 120);
  assert.equal(decoded.diastolic, 80);
  assert.equal(decoded.meanArterialPressure, 93);
  assert.equal(decoded.unit, 'mmHg');
  assert.equal(decoded.pulseRate, undefined);
});

test('the blood-pressure flags report kPa and read the pulse rate when present', () => {
  const sys = sfloat16Bytes(120, 0);
  const dia = sfloat16Bytes(80, 0);
  const map = sfloat16Bytes(93, 0);
  // bit0 = kPa, bit1 = timestamp (7 bytes), bit2 = pulse rate.
  const timestamp = [0xe8, 0x07, 0x0a, 0x18, 0x0e, 0x1e, 0x00];
  const pulse = sfloat16Bytes(72, 0);
  const decoded = parseBloodPressureMeasurement(bytes(0x07, ...sys, ...dia, ...map, ...timestamp, ...pulse));
  assert.ok(decoded);
  assert.equal(decoded.unit, 'kPa');
  assert.equal(decoded.pulseRate, 72);
});

test('a truncated blood-pressure packet is refused rather than half-read', () => {
  assert.equal(parseBloodPressureMeasurement(bytes(0x00, 0x00, 0x00)), null);
});

// ── Temperature Measurement (0x2A1C) ──

test('a temperature measurement decodes 37.2 °C from its flags', () => {
  const decoded = parseTemperatureMeasurement(bytes(0x00, 0x74, 0x01, 0x00, 0xff));
  assert.ok(decoded);
  assert.equal(decoded.value, 37.2);
  assert.equal(decoded.unit, '°C');
});

test('the temperature flags report Fahrenheit', () => {
  const decoded = parseTemperatureMeasurement(bytes(0x01, 0x74, 0x01, 0x00, 0x00));
  assert.ok(decoded);
  assert.equal(decoded.unit, '°F');
});

test('a truncated temperature packet is refused', () => {
  assert.equal(parseTemperatureMeasurement(bytes(0x00, 0x74)), null);
});

// ── Glucose Measurement (0x2A18) ──

test('a mol/L glucose measurement converts to mmol/L and flags the conversion', () => {
  const conc = sfloat16Bytes(55, -4); // 0.0055 mol/L
  const decoded = parseGlucoseMeasurement(bytes(0x06, 0x01, 0x00, 0xe8, 0x07, 0x0a, 0x18, 0x0e, 0x1e, ...conc));
  assert.ok(decoded);
  assert.equal(decoded.value, 5.5);
  assert.equal(decoded.unit, 'mmol/L');
  assert.equal(decoded.deviceUnit, 'mol/L');
  assert.equal(decoded.converted, true);
});

test('a kg/L glucose measurement converts to mg/dL', () => {
  const conc = sfloat16Bytes(12, -4); // 0.0012 kg/L
  const decoded = parseGlucoseMeasurement(bytes(0x02, 0x01, 0x00, 0xe8, 0x07, 0x0a, 0x18, 0x0e, 0x1e, ...conc));
  assert.ok(decoded);
  assert.equal(decoded.value, 120);
  assert.equal(decoded.unit, 'mg/dL');
  assert.equal(decoded.deviceUnit, 'kg/L');
});

test('a truncated glucose packet is refused', () => {
  assert.equal(parseGlucoseMeasurement(bytes(0x02, 0x01, 0x00)), null);
});

// ── Support detection ──

test('bluetooth support is reported honestly instead of assumed', () => {
  assert.equal(bluetoothSupport(undefined), false);
  assert.equal(bluetoothSupport({}), false);
  assert.equal(bluetoothSupport({ bluetooth: {} }), true);
  assert.match(BLUETOOTH_UNSUPPORTED_NOTE, /does not provide Bluetooth/);
  assert.match(BLUETOOTH_UNSUPPORTED_NOTE, /Type the reading in instead/);
});
