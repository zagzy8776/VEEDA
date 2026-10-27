import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilityRegistry,
  type PlatformSnapshot,
} from '../src/app/capabilityRegistry.ts';

function snap(overrides: Partial<PlatformSnapshot> = {}): PlatformSnapshot {
  return {
    hasGetUserMedia: true,
    hasDeviceMotion: true,
    hasDeviceOrientation: true,
    hasGeolocation: true,
    hasPressureSensor: true,
    hasBatteryApi: true,
    hasAmbientLightSensor: true,
    hasProximitySensor: true,
    hasNetworkInformation: true,
    hasWebBluetooth: true,
    hasMediaRecorder: true,
    hasSpeechRecognition: true,
    isSecureContext: true,
    isMobile: true,
    consent: {},
    flags: { visionInference: true },
    hasLlmProvider: true,
    hasRegulatoryVerifyUrl: true,
    hasMapProvider: true,
    ...overrides,
  };
}

// ── Detection: platform available ──

test('all capabilities available when platform supports everything and consent granted', () => {
  const s = snap({
    consent: {
      health_data_processing: true,
      camera_sensor: true,
      mic_sensor: true,
      motion_sensor: true,
      location_sensor: true,
    },
  });
  const reg = buildCapabilityRegistry(s);
  assert.equal(reg.unavailable().length, 0);
  assert.equal(reg.available().length, reg.list().length);
});

test('heart_rate_camera unavailable when getUserMedia missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasGetUserMedia: false }));
  assert.equal(reg.get('heart_rate_camera').available, false);
  assert.match(reg.get('heart_rate_camera').reason, /camera not available/);
});

test('heart_rate_camera unavailable in insecure context', () => {
  const reg = buildCapabilityRegistry(snap({ isSecureContext: false }));
  assert.equal(reg.get('heart_rate_camera').available, false);
});

test('step_counter unavailable when DeviceMotionEvent missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasDeviceMotion: false }));
  assert.equal(reg.get('step_counter').available, false);
  assert.match(reg.get('step_counter').reason, /motion sensor not available/);
});

test('gyroscope unavailable when DeviceOrientationEvent missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasDeviceOrientation: false }));
  assert.equal(reg.get('gyroscope').available, false);
  assert.match(reg.get('gyroscope').reason, /orientation sensor not available/);
});

test('geolocation unavailable when navigator.geolocation missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasGeolocation: false }));
  assert.equal(reg.get('geolocation').available, false);
});

test('barometer unavailable when PressureSensor missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasPressureSensor: false }));
  assert.equal(reg.get('barometer').available, false);
});

test('battery_temperature unavailable when getBattery missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasBatteryApi: false }));
  assert.equal(reg.get('battery_temperature').available, false);
});

test('ambient_light unavailable when AmbientLightSensor missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasAmbientLightSensor: false }));
  assert.equal(reg.get('ambient_light').available, false);
});

test('proximity unavailable when ProximitySensor missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasProximitySensor: false }));
  assert.equal(reg.get('proximity').available, false);
});

test('network_status unavailable when navigator.connection missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasNetworkInformation: false }));
  assert.equal(reg.get('network_status').available, false);
});

test('bluetooth_le unavailable when Web Bluetooth missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasWebBluetooth: false }));
  assert.equal(reg.get('bluetooth_le').available, false);
  assert.equal(reg.get('ble_blood_pressure').available, false);
});

test('speech_recognition unavailable when not supported', () => {
  const reg = buildCapabilityRegistry(snap({ hasSpeechRecognition: false }));
  assert.equal(reg.get('speech_recognition').available, false);
});

test('audio_recording unavailable when MediaRecorder missing', () => {
  const reg = buildCapabilityRegistry(snap({ hasMediaRecorder: false }));
  assert.equal(reg.get('audio_recording').available, false);
});

test('chat_llm unavailable when no LLM provider', () => {
  const reg = buildCapabilityRegistry(snap({ hasLlmProvider: false }));
  assert.equal(reg.get('chat_llm').available, false);
  assert.match(reg.get('chat_llm').reason, /no LLM provider/);
});

test('medicine_authenticity unavailable when no regulatory URL', () => {
  const reg = buildCapabilityRegistry(snap({ hasRegulatoryVerifyUrl: false }));
  assert.equal(reg.get('medicine_authenticity').available, false);
});

test('nearby_care unavailable when no map provider', () => {
  const reg = buildCapabilityRegistry(snap({ hasMapProvider: false }));
  assert.equal(reg.get('nearby_care').available, false);
});

// ── Always-available capabilities ──

test('emergency_ladder always available', () => {
  const reg = buildCapabilityRegistry(snap({ hasGetUserMedia: false, isSecureContext: false }));
  assert.equal(reg.get('emergency_ladder').available, true);
  assert.equal(reg.get('emergency_number').available, true);
});

test('chat_local always available', () => {
  const reg = buildCapabilityRegistry(snap({ hasGetUserMedia: false }));
  assert.equal(reg.get('chat_local').available, true);
});

test('medicine_lookup always available', () => {
  const reg = buildCapabilityRegistry(snap({}));
  assert.equal(reg.get('medicine_lookup').available, true);
  assert.equal(reg.get('medicine_interactions').available, true);
});

test('weather always available', () => {
  const reg = buildCapabilityRegistry(snap({}));
  assert.equal(reg.get('weather').available, true);
});

test('patient_context always available', () => {
  const reg = buildCapabilityRegistry(snap({}));
  assert.equal(reg.get('patient_context').available, true);
  assert.equal(reg.get('dependent_profiles').available, true);
});

// ── Consent gating ──

test('heart_rate_camera unavailable without camera consent', () => {
  const reg = buildCapabilityRegistry(snap({ consent: {} }));
  assert.equal(reg.get('heart_rate_camera').available, false);
  assert.match(reg.get('heart_rate_camera').reason, /consent not granted/);
});

test('heart_rate_camera available with camera consent', () => {
  const reg = buildCapabilityRegistry(snap({ consent: { camera_sensor: true } }));
  assert.equal(reg.get('heart_rate_camera').available, true);
});

test('step_counter unavailable without motion consent', () => {
  const reg = buildCapabilityRegistry(snap({ consent: {} }));
  assert.equal(reg.get('step_counter').available, false);
  assert.match(reg.get('step_counter').reason, /consent not granted/);
});

test('geolocation unavailable without location consent', () => {
  const reg = buildCapabilityRegistry(snap({ consent: {} }));
  assert.equal(reg.get('geolocation').available, false);
  assert.match(reg.get('geolocation').reason, /consent not granted/);
});

test('bluetooth unavailable without health_data_processing consent', () => {
  const reg = buildCapabilityRegistry(snap({ consent: {} }));
  assert.equal(reg.get('bluetooth_le').available, false);
  assert.match(reg.get('bluetooth_le').reason, /consent not granted/);
});

// ── Registry factory ──

test('list returns all capability IDs', () => {
  const reg = buildCapabilityRegistry(snap({}));
  assert.equal(reg.list().length, 32);
});

test('available and unavailable partition the full list', () => {
  const reg = buildCapabilityRegistry(snap({ hasGetUserMedia: false, consent: {} }));
  const all = reg.list();
  const avail = reg.available();
  const unavail = reg.unavailable();
  assert.equal(avail.length + unavail.length, all.length);
  assert.equal(new Set([...avail, ...unavail]).size, all.length);
});

test('get caches results (same reference)', () => {
  const reg = buildCapabilityRegistry(snap({}));
  const a = reg.get('heart_rate_camera');
  const b = reg.get('heart_rate_camera');
  assert.deepEqual(a, b);
});

test('unknown capability returns unavailable', () => {
  const reg = buildCapabilityRegistry(snap({}));
  // @ts-expect-error testing unknown id
  const state = reg.get('nonexistent_capability');
  assert.equal(state.available, false);
});
