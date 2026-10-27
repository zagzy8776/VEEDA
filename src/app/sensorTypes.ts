// Normalized sensor data types for the VEEDA Sensor Hub.
// This file defines the core structures used to represent any measurement
// coming from phone sensors, Bluetooth medical devices, or manual user entry.
//
// NOTE: enums are intentionally avoided. The test runner uses
// `node --test --experimental-strip-types`, which only strips type annotations
// and does NOT perform TypeScript enum transformation. String-literal unions
// are pure types and are erased entirely at runtime, so values such as
// MeasurementQuality.GOOD are never used — only the string literals 'GOOD', etc.

export type CapabilityId =
  | 'heart_rate_camera'
  | 'breath_rate_mic'
  | 'step_counter'
  | 'gyroscope'
  | 'geolocation'
  | 'barometer'
  | 'battery_temperature'
  | 'ambient_light'
  | 'proximity'
  | 'network_status'
  | 'bluetooth_le'
  | 'ble_blood_pressure'
  | 'ble_body_temperature'
  | 'ble_blood_glucose'
  | 'camera_capture'
  | 'camera_ocr'
  | 'mic_capture'
  | 'speech_recognition'
  | 'audio_recording'
  | 'chat_local'
  | 'chat_llm'
  | 'chat_image_input'
  | 'emergency_ladder'
  | 'emergency_number'
  | 'medicine_lookup'
  | 'medicine_interactions'
  | 'medicine_authenticity'
  | 'nearby_care'
  | 'weather'
  | 'patient_context'
  | 'dependent_profiles'
  // Extend as new capabilities are added.
  ;

/**
 * The type of physiological or environmental measurement.
 */
export type MeasurementType =
  | 'heart_rate'
  | 'breath_rate'
  | 'step_count'
  | 'orientation'
  | 'location'
  | 'pressure'
  | 'battery_temp'
  | 'ambient_light'
  | 'proximity'
  | 'network_status'
  | 'blood_pressure'
  | 'body_temperature'
  | 'blood_glucose'
  | 'image'
  | 'audio'
  | 'text'
  | 'symptom'
  | 'medication'
  | 'food'
  // Add more as needed.
  ;

/**
 * Quality / status of a measurement.
 * String literals only — see file header for why enums are not used.
 */
export type MeasurementQuality =
  | 'GOOD'
  | 'WEAK'
  | 'NO_SIGNAL'
  | 'UNRELIABLE'
  | 'UNAVAILABLE'
  | 'STALE';

/**
 * Source of the data.
 * String literals only — see file header for why enums are not used.
 */
export type MeasurementSource =
  | 'PHONE_SENSOR'   // Direct sensor reading from the phone.
  | 'ESTIMATE'       // Derived estimate (e.g., rPPG heart-rate).
  | 'MANUAL'         // User entered.
  | 'EXTERNAL_DEVICE' // Bluetooth / BLE medical device.
  | 'UNKNOWN';

/**
 * Normalized representation of any sensor reading.
 */
export interface NormalizedSensorReading {
  /** Capability that produced the reading (matches CapabilityId). */
  capabilityId: CapabilityId;
  /** What is being measured. */
  measurementType: MeasurementType;
  /** Numeric value (or string for non-numeric types). */
  value: number | string;
  /** Unit of the value, e.g., 'bpm', '°C', 'mmHg'. */
  unit: string;
  /** Where the data originated. */
  source: MeasurementSource;
  /** ISO timestamp when the reading was captured. */
  timestamp: string;
  /** Freshness in seconds – callers can compute based on now. */
  freshness: number;
  /** Quality / confidence of the measurement. */
  quality: MeasurementQuality;
  /** Optional device identifier for external devices. */
  deviceId?: string;
  /** Human-readable description of the measurement (optional). */
  description?: string;
}
