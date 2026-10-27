// Reading a Bluetooth medical device (Web Bluetooth).
//
// VEEDA reads the three standard GATT services a home monitor can expose and
// turns the raw bytes into the same reading objects the typed-in path already
// uses. The decoders are pure functions over a `DataView`, so they can be tested
// without a browser, and every byte layout below follows the Bluetooth SIG
// definitions rather than a guess:
//
//   • Blood Pressure Service 0x1810 / Measurement 0x2A35
//       Flags (1) | Systolic / Diastolic / MAP as 16-bit SFLOAT
//   • Health Thermometer Service 0x1809 / Measurement 0x2A1C
//       Flags (1) | Temperature as IEEE-11073 32-bit FLOAT (24-bit mantissa LE
//       + 8-bit base-10 exponent)
//   • Glucose Service 0x1808 / Measurement 0x2A18
//       Flags (1) | Sequence (2) | Base Time (7) | [Time Offset (2)] |
//       Concentration (16-bit SFLOAT) | Type/Sample Location (1)
//
// Web Bluetooth does not exist in iOS Safari and is not exposed by every
// browser, so typed entry is always kept as the fallback. This module reports
// support honestly instead of pretending, and it never fabricates a reading: a
// device that reports an undefined/special value is rejected by the normal
// plausibility check rather than stored.

import type { GlucoseUnit, TemperatureUnit } from './bpGlucose.ts';

export type BleDeviceKind = 'blood_pressure' | 'body_temperature' | 'blood_glucose';

export interface BleServiceSpec {
  kind: BleDeviceKind;
  /** Short human label for the connect button. */
  label: string;
  /** Optional GATT services the device may advertise. */
  optionalServices: string[];
  service: string;
  characteristic: string;
}

// Standard Bluetooth SIG services and characteristics.
export const BLE_SERVICES: Record<BleDeviceKind, BleServiceSpec> = {
  blood_pressure: {
    kind: 'blood_pressure',
    label: 'Blood-pressure monitor',
    optionalServices: ['blood_pressure'],
    service: 'blood_pressure',
    characteristic: 'blood_pressure_measurement',
  },
  body_temperature: {
    kind: 'body_temperature',
    label: 'Thermometer',
    optionalServices: ['health_thermometer'],
    service: 'health_thermometer',
    characteristic: 'temperature_measurement',
  },
  blood_glucose: {
    kind: 'blood_glucose',
    label: 'Glucose meter',
    optionalServices: ['glucose'],
    service: 'glucose',
    characteristic: 'glucose_measurement',
  },
};

export const BLUETOOTH_UNSUPPORTED_NOTE =
  'This browser does not provide Bluetooth access, so readings cannot be pulled from a device here. Type the reading in instead — it is stored the same way.';

/** True when this browser exposes Web Bluetooth (so a device can be read). */
export function bluetoothSupport(nav: unknown): boolean {
  return Boolean(nav && typeof nav === 'object' && 'bluetooth' in (nav as Record<string, unknown>));
}

// ── Raw value decoders ──

const SFLOAT_NAN = 0x07ff;
const SFLOAT_NRES = 0x0800;
const SFLOAT_POS_INF = 0x07fe;
const SFLOAT_NEG_INF = 0x0802;

/**
 * Decode a 16-bit IEEE-11073 SFLOAT: a signed 4-bit exponent (low nibble) and a
 * signed 12-bit mantissa (high 12 bits), giving `mantissa × 10^exponent`.
 * Reserved/special values return NaN so the plausibility check rejects them.
 */
export function decodeSfloat16(view: DataView, offset: number): number {
  const raw = view.getUint16(offset, true);
  if (raw === SFLOAT_NAN || raw === SFLOAT_NRES || raw === SFLOAT_POS_INF || raw === SFLOAT_NEG_INF) {
    return NaN;
  }
  let exponent = raw & 0x000f;
  if (exponent >= 0x8) exponent -= 0x10; // 4-bit two's complement
  let mantissa = raw >> 4;
  if (mantissa >= 0x800) mantissa -= 0x1000; // 12-bit two's complement
  return mantissa * Math.pow(10, exponent);
}

const FLOAT32_NAN = 0x007fffff;
const FLOAT32_NRES = 0x00800000;
const FLOAT32_POS_INF = 0x007ffffe;
const FLOAT32_NEG_INF = 0x00800002;

/**
 * Decode an IEEE-11073 32-bit FLOAT: a signed 24-bit little-endian mantissa
 * (bytes 0–2) and a signed 8-bit base-10 exponent (byte 3), giving
 * `mantissa × 10^exponent`.
 */
export function decodeFloat32Ieee11073(view: DataView, offset: number): number {
  const b0 = view.getUint8(offset);
  const b1 = view.getUint8(offset + 1);
  const b2 = view.getUint8(offset + 2);
  const unsigned = (b0 | (b1 << 8) | (b2 << 16)) >>> 0;
  if (
    unsigned === FLOAT32_NAN ||
    unsigned === FLOAT32_NRES ||
    unsigned === FLOAT32_POS_INF ||
    unsigned === FLOAT32_NEG_INF
  ) {
    return NaN;
  }
  let mantissa = unsigned;
  if (mantissa >= 0x800000) mantissa -= 0x1000000; // 24-bit two's complement

  const exponent = view.getInt8(offset + 3); // already signed
  return mantissa * Math.pow(10, exponent);
}

// ── Measurement parsers ──

export interface DecodedBloodPressure {
  systolic: number;
  diastolic: number;
  meanArterialPressure: number;
  /** The unit the device reported. VEEDA stores it as sent. */
  unit: 'mmHg' | 'kPa';
  pulseRate?: number;
}

/** Parse a Blood Pressure Measurement (0x2A35). Returns null if too short. */
export function parseBloodPressureMeasurement(view: DataView): DecodedBloodPressure | null {
  if (view.byteLength < 7) return null;
  const flags = view.getUint8(0);
  const unit = (flags & 0x01) === 0 ? 'mmHg' : 'kPa';
  const systolic = decodeSfloat16(view, 1);
  const diastolic = decodeSfloat16(view, 3);
  const meanArterialPressure = decodeSfloat16(view, 5);

  const result: DecodedBloodPressure = { systolic, diastolic, meanArterialPressure, unit };

  // Bit 1 = timestamp present (7 bytes), bit 2 = pulse rate present.
  let offset = 7;
  if (flags & 0x02) offset += 7;
  if (flags & 0x04) {
    if (view.byteLength >= offset + 2) result.pulseRate = decodeSfloat16(view, offset);
  }
  return result;
}

export interface DecodedTemperature {
  value: number;
  unit: TemperatureUnit;
  /** Optional 8-bit temperature-type/site code from the device. */
  site?: number;
}

/** Parse a Temperature Measurement (0x2A1C). Returns null if too short. */
export function parseTemperatureMeasurement(view: DataView): DecodedTemperature | null {
  if (view.byteLength < 5) return null;
  const flags = view.getUint8(0);
  const unit: TemperatureUnit = (flags & 0x01) === 0 ? '°C' : '°F';
  const value = decodeFloat32Ieee11073(view, 1);

  const result: DecodedTemperature = { value, unit };

  // Bit 1 = timestamp present (7 bytes), bit 2 = temperature type present.
  let offset = 5;
  if (flags & 0x02) offset += 7;
  if (flags & 0x04) {
    if (view.byteLength > offset) result.site = view.getUint8(offset);
  }
  return result;
}

export interface DecodedGlucose {
  value: number;
  unit: GlucoseUnit;
  /** The unit the device sent, before conversion to the app's unit. */
  deviceUnit: 'kg/L' | 'mol/L';
  /** True when a conversion was applied to reach `unit`. */
  converted: boolean;
}

/**
 * Parse a Glucose Measurement (0x2A18). The device reports concentration in
 * kg/L or mol/L; the app stores mg/dL or mmol/L. That conversion is explicit
 * (×100000 for mg/dL, ×1000 for mmol/L) and flagged, so the UI can say a
 * conversion happened rather than presenting a device number as if typed.
 */
export function parseGlucoseMeasurement(view: DataView): DecodedGlucose | null {
  if (view.byteLength < 10) return null;
  const flags = view.getUint8(0);
  const concentrationMolPerL = (flags & 0x04) !== 0;

  // Sequence Number (2) + Base Time (7) → first free byte is 9.
  let offset = 9;
  if (flags & 0x01) offset += 2; // Time Offset present
  if (view.byteLength < offset + 2) return null;

  const raw = decodeSfloat16(view, offset);

  if (concentrationMolPerL) {
    // Device unit is mol/L → mmol/L (display convention).
    return { value: Math.round(raw * 1000 * 10) / 10, unit: 'mmol/L', deviceUnit: 'mol/L', converted: true };
  }
  // Device unit is kg/L → mg/dL.
  return { value: Math.round(raw * 100000), unit: 'mg/dL', deviceUnit: 'kg/L', converted: true };
}

// ── Live device connection ──

/** The slice of the Web Bluetooth API this module uses. */
interface BluetoothRemoteGattCharacteristicLike {
  value?: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGattCharacteristicLike>;
  addEventListener(type: string, listener: (event: { target: BluetoothRemoteGattCharacteristicLike }) => void): void;
  removeEventListener(type: string, listener: (event: { target: BluetoothRemoteGattCharacteristicLike }) => void): void;
}
interface BluetoothRemoteGattServiceLike {
  getCharacteristic(name: string): Promise<BluetoothRemoteGattCharacteristicLike>;
}
interface BluetoothRemoteGattServerLike {
  connect(): Promise<BluetoothRemoteGattServerLike>;
  disconnect(): void;
  getPrimaryService(name: string): Promise<BluetoothRemoteGattServiceLike>;
  connected?: boolean;
}
interface BluetoothDeviceLike {
  name?: string | null;
  gatt?: BluetoothRemoteGattServerLike;
}
interface BluetoothLike {
  requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
}

export interface DeviceReadingHandlers {
  onBloodPressure: (decoded: DecodedBloodPressure) => void;
  onTemperature: (decoded: DecodedTemperature) => void;
  onGlucose: (decoded: DecodedGlucose) => void;
}

/**
 * Ask the user for a device of `kind` and stream its measurements until they
 * disconnect. Returns a disconnect function. Throws a plain Error with a
 * human-readable message on failure (including "cancelled"), so the caller can
 * fall back to typed entry.
 */
export async function readFromDevice(
  nav: unknown,
  kind: BleDeviceKind,
  handlers: DeviceReadingHandlers,
): Promise<() => void> {
  const bluetooth = (nav as { bluetooth?: BluetoothLike } | null)?.bluetooth;
  if (!bluetooth) throw new Error(BLUETOOTH_UNSUPPORTED_NOTE);

  const spec = BLE_SERVICES[kind];
  // Accept any device rather than filtering by advertised service: many home
  // monitors do not put the service in the advertisement packet, so filtering
  // would hide the user's own monitor from the chooser.
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: spec.optionalServices,
  });
  if (!device.gatt) throw new Error('That device did not offer a readable medical service.');

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(spec.service);
  const characteristic = await service.getCharacteristic(spec.characteristic);
  await characteristic.startNotifications();

  const onValue = (event: { target: BluetoothRemoteGattCharacteristicLike }) => {
    const view = event.target.value;
    if (!view) return;
    if (kind === 'blood_pressure') {
      const decoded = parseBloodPressureMeasurement(view);
      if (decoded) handlers.onBloodPressure(decoded);
    } else if (kind === 'body_temperature') {
      const decoded = parseTemperatureMeasurement(view);
      if (decoded) handlers.onTemperature(decoded);
    } else {
      const decoded = parseGlucoseMeasurement(view);
      if (decoded) handlers.onGlucose(decoded);
    }
  };
  characteristic.addEventListener('characteristicvaluechanged', onValue);

  // Some monitors only push a new value; if one is already present, use it.
  if (characteristic.value) onValue({ target: characteristic });

  return () => {
    try {
      characteristic.removeEventListener('characteristicvaluechanged', onValue);
      if (server.connected) server.disconnect();
    } catch {}
  };
}
