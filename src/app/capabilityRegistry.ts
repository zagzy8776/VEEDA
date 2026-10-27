// Central capability registry — pure module.
// 
// Answers one question for the rest of the app: "What can this phone actually do
// right now, and what is it allowed to do?" Replaces scattered
// `if ('bluetooth' in navigator)` checks and ad-hoc feature flags with one
// registry that every sensor, chat, and emergency path consults.
// 
// Discipline (inherited from modelRegistry.ts, featureFlags.ts, consent.ts,
// deviceSensors.ts):
//   - Pure module: no React, no storage, no timers, no network.
//   - Safe-fail outcomes: every capability resolves to a union type with an
//     explicit available/unavailable state and a plain reason string. Never throws.
//   - Consent-gated: a capability is only `available` when the user has granted
//     the relevant ConsentFeature.
//   - Feature-flag-gated: capabilities needing outside data also check featureFlags.
//   - No clinical claims: reports availability, never diagnosis.
//   - Platform-agnostic detection: detection takes a PlatformSnapshot (plain object),
//     so tests can simulate any device without mocking globals.

import type { ConsentFeature } from './consent.ts';
import type { FeatureFlag } from './featureFlags.ts';

export type CapabilityId =
  // Sensors
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
  // Bluetooth
  | 'bluetooth_le'
  | 'ble_blood_pressure'
  | 'ble_body_temperature'
  | 'ble_blood_glucose'
  // Camera
  | 'camera_capture'
  | 'camera_ocr'
  // Microphone
  | 'mic_capture'
  | 'speech_recognition'
  | 'audio_recording'
  // Chat
  | 'chat_local'
  | 'chat_llm'
  | 'chat_image_input'
  | 'chat_vision' // NEW: vision-capable image input
  // Emergency (always available)
  | 'emergency_ladder'
  | 'emergency_number'
  // Medication
  | 'medicine_lookup'
  | 'medicine_interactions'
  | 'medicine_authenticity'
  // Location
  | 'nearby_care'
  | 'weather'
  // Patient context (always available)
  | 'patient_context'
  | 'dependent_profiles';

export type CapabilityState =
  | { available: true; reason: 'available' }
  | { available: false; reason: string };

export interface PlatformSnapshot {
  hasGetUserMedia: boolean;
  hasDeviceMotion: boolean;
  hasDeviceOrientation: boolean;
  hasGeolocation: boolean;
  hasPressureSensor: boolean;
  hasBatteryApi: boolean;
  hasAmbientLightSensor: boolean;
  hasProximitySensor: boolean;
  hasNetworkInformation: boolean;
  hasWebBluetooth: boolean;
  hasMediaRecorder: boolean;
  hasSpeechRecognition: boolean;
  isSecureContext: boolean;
  isMobile: boolean;
  consent: Partial<Record<ConsentFeature, boolean>>;
  flags: Partial<Record<FeatureFlag, boolean>>;
  hasLlmProvider: boolean;
  hasRegulatoryVerifyUrl: boolean;
  hasMapProvider: boolean;
}

export interface CapabilityRegistry {
  get(id: CapabilityId): CapabilityState;
  list(): CapabilityId[];
  available(): CapabilityId[];
  unavailable(): CapabilityId[];
}

const CONSENT_MAP: Partial<Record<CapabilityId, ConsentFeature>> = {
  heart_rate_camera: 'camera_sensor',
  breath_rate_mic: 'mic_sensor',
  step_counter: 'motion_sensor',
  gyroscope: 'motion_sensor',
  geolocation: 'location_sensor',
  barometer: 'motion_sensor',
  battery_temperature: 'motion_sensor',
  ambient_light: 'motion_sensor',
  proximity: 'motion_sensor',
  bluetooth_le: 'health_data_processing',
  ble_blood_pressure: 'health_data_processing',
  ble_body_temperature: 'health_data_processing',
  ble_blood_glucose: 'health_data_processing',
  camera_capture: 'camera_sensor',
  camera_ocr: 'camera_sensor',
  mic_capture: 'mic_sensor',
  speech_recognition: 'mic_sensor',
  audio_recording: 'mic_sensor',
  chat_image_input: 'camera_sensor',
  chat_vision: 'camera_sensor', // NEW: vision requires camera consent
};

const FLAG_MAP: Partial<Record<CapabilityId, FeatureFlag>> = {
  chat_vision: 'visionInference',
};

function detect(id: CapabilityId, snap: PlatformSnapshot): CapabilityState {
  switch (id) {
    case 'heart_rate_camera':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'camera not available on this device' };

    case 'breath_rate_mic':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'microphone not available on this device' };

    case 'step_counter':
      return snap.hasDeviceMotion
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'motion sensor not available on this device' };

    case 'gyroscope':
      return snap.hasDeviceOrientation
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'orientation sensor not available on this device' };

    case 'geolocation':
      return snap.hasGeolocation
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'location not available on this device' };

    case 'barometer':
      return snap.hasPressureSensor
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'barometer not available on this device' };

    case 'battery_temperature':
      return snap.hasBatteryApi
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'battery sensor not available on this device' };

    case 'ambient_light':
      return snap.hasAmbientLightSensor
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'ambient light sensor not available on this device' };

    case 'proximity':
      return snap.hasProximitySensor
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'proximity sensor not available on this device' };

    case 'network_status':
      return snap.hasNetworkInformation
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'network information not available on this device' };

    case 'bluetooth_le':
      return snap.hasWebBluetooth && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'Bluetooth not available on this device' };

    case 'ble_blood_pressure':
    case 'ble_body_temperature':
    case 'ble_blood_glucose':
      return snap.hasWebBluetooth && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'Bluetooth medical device not available' };

    case 'camera_capture':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'camera not available on this device' };

    case 'camera_ocr':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'camera not available for OCR' };

    case 'mic_capture':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'microphone not available on this device' };

    case 'speech_recognition':
      return snap.hasSpeechRecognition
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'speech recognition not available on this device' };

    case 'audio_recording':
      return snap.hasMediaRecorder
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'audio recording not available on this device' };

    case 'chat_local':
      return { available: true, reason: 'available' };

    case 'chat_llm':
      return snap.hasLlmProvider
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'no LLM provider configured' };

    case 'chat_image_input':
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'camera not available for image input' };

    case 'chat_vision':
      // Vision requires camera + a validated vision-capable provider
      // The actual availability is determined by the vision provider allowlist + backend key
      // This detection only checks platform capabilities; the flag/consent layers handle the rest
      return snap.hasGetUserMedia && snap.isSecureContext
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'camera not available for vision input' };

    case 'emergency_ladder':
    case 'emergency_number':
      return { available: true, reason: 'available' };

    case 'medicine_lookup':
    case 'medicine_interactions':
      return { available: true, reason: 'available' };

    case 'medicine_authenticity':
      return snap.hasRegulatoryVerifyUrl
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'regulatory verification not configured' };

    case 'nearby_care':
      return snap.hasMapProvider
        ? { available: true, reason: 'available' }
        : { available: false, reason: 'map provider not configured' };

    case 'weather':
      return { available: true, reason: 'available' };

    case 'patient_context':
    case 'dependent_profiles':
      return { available: true, reason: 'available' };

    default:
      return { available: false, reason: 'unknown capability' };
  }
}

function applyConsent(id: CapabilityId, state: CapabilityState, snap: PlatformSnapshot): CapabilityState {
  const feature = CONSENT_MAP[id];
  if (!feature) return state;
  if (!state.available) return state;
  if (!snap.consent[feature]) {
    return { available: false, reason: `consent not granted for ${feature}` };
  }
  return state;
}

function applyFlags(id: CapabilityId, state: CapabilityState, snap: PlatformSnapshot): CapabilityState {
  const flag = FLAG_MAP[id];
  if (!flag) return state;
  if (!state.available) return state;
  if (!snap.flags[flag]) {
    return { available: false, reason: `feature flag ${flag} not enabled` };
  }
  return state;
}

const ALL_CAPABILITY_IDS: CapabilityId[] = [
  'heart_rate_camera', 'breath_rate_mic', 'step_counter', 'gyroscope',
  'geolocation', 'barometer', 'battery_temperature', 'ambient_light',
  'proximity', 'network_status',
  'bluetooth_le', 'ble_blood_pressure', 'ble_body_temperature', 'ble_blood_glucose',
  'camera_capture', 'camera_ocr',
  'mic_capture', 'speech_recognition', 'audio_recording',
  'chat_local', 'chat_llm', 'chat_image_input', 'chat_vision',
  'emergency_ladder', 'emergency_number',
  'medicine_lookup', 'medicine_interactions', 'medicine_authenticity',
  'nearby_care', 'weather',
  'patient_context', 'dependent_profiles',
];

export function buildCapabilityRegistry(snap: PlatformSnapshot): CapabilityRegistry {
  const cache = new Map<CapabilityId, CapabilityState>();

  function resolve(id: CapabilityId): CapabilityState {
    const cached = cache.get(id);
    if (cached) return cached;
    let state = detect(id, snap);
    state = applyConsent(id, state, snap);
    state = applyFlags(id, state, snap);
    cache.set(id, state);
    return state;
  }

  return {
    get: resolve,
    list: () => ALL_CAPABILITY_IDS,
    available: () => ALL_CAPABILITY_IDS.filter(id => resolve(id).available),
    unavailable: () => ALL_CAPABILITY_IDS.filter(id => !resolve(id).available),
  };
}
