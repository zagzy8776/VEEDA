// On-device sensor support for Phase 1 (barometer reading, battery temperature).
//
// These are the two Phase 1 sources that come from the phone itself rather than
// an outside feed. Both are wrapped in a capability check so a missing sensor is
// a plain "not available on this device" state, never an error and never a
// guessed value.
//
// No threshold lives here: this module only reads a value and reports whether it
// is available. Deciding whether a reading is worth an alert is done by the alert
// engine using wording and (future) limits from a reviewed pack.

export type SensorReading =
  | { available: true; value: number; unit: string; source: 'device_sensor'; capturedAt: string }
  | { available: false; reason: string };

export interface BarometerLike {
  pressure?: number; // hPa, if the platform exposes it
}

/**
 * Normalize a pressure reading. The Web Sensor API is not implemented in most
 * browsers, so callers pass whatever their platform exposes; a missing value is
 * reported as unavailable rather than fabricated.
 */
export function readBarometer(input: BarometerLike | null | undefined, now: Date = new Date()): SensorReading {
  const pressure = input?.pressure;
  if (typeof pressure !== 'number' || !Number.isFinite(pressure) || pressure <= 0) {
    return { available: false, reason: 'this device does not report barometric pressure' };
  }
  return {
    available: true,
    value: pressure,
    unit: 'hPa',
    source: 'device_sensor',
    capturedAt: now.toISOString(),
  };
}

export interface BatteryLike {
  temperatureCelsius?: number;
}

/**
 * Normalize a battery-temperature reading. A device that exposes no temperature
 * (most desktop browsers) reports unavailable. The value is passed through
 * unchanged; this module never decides a safe range.
 */
export function readBatteryTemperature(input: BatteryLike | null | undefined, now: Date = new Date()): SensorReading {
  const temperature = input?.temperatureCelsius;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
    return { available: false, reason: 'this device does not report battery temperature' };
  }
  return {
    available: true,
    value: temperature,
    unit: '°C',
    source: 'device_sensor',
    capturedAt: now.toISOString(),
  };
}
