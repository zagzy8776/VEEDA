// Sensor-aware context builder for VEEDA Chat and Clinical Reasoning.
// This module selects relevant sensor data from the hub based on conversation intent,
// avoiding dumping all raw streams into every prompt.

import { sensorHub } from './sensorHub';
import type { NormalizedSensorReading, MeasurementSource, MeasurementQuality } from './sensorTypes';
import { lookupModel, notValidatedLabel, buildRegistry, type ModelRegistry } from './modelRegistry';
import { apiFetchDetailed } from './api';
import { getVisionAllowlist, resolveVisionState, visionStateLabel } from './visionProviderAllowlist';
import { loadPatientHealthContext } from './patientHealthContext';
// Note: MeasurementSource/MeasurementQuality are now plain string-literal unions
// (see sensorTypes.ts). The comparisons below use string literals directly.

export interface SensorContextSummary {
  heartRate?: { value: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  breathRate?: { value: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  bloodPressure?: { systolic: number; diastolic: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  bodyTemperature?: { value: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  bloodGlucose?: { value: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  stepCount?: { value: number; unit: string; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  location?: { lat: number; lon: number; accuracy: number; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
  networkStatus?: { online: boolean; effectiveType: string | null; source: MeasurementSource; quality: MeasurementQuality; timestamp: string };
}

/**
 * Extracts a normalized summary of recent physiological measurements from the Sensor Hub.
 * Only includes readings that are fresh (< 5 minutes old) and have valid quality/source metadata.
 */
export function getRecentSensorContext(maxAgeSeconds = 300): SensorContextSummary {
  const now = Date.now();
  const summary: SensorContextSummary = {};

  const isFresh = (timestampStr: string) => {
    const ts = new Date(timestampStr).getTime();
    return !isNaN(ts) && (now - ts) / 1000 <= maxAgeSeconds;
  };

  // Helper to find latest reading by capability ID
  const getLatest = (capId: string): NormalizedSensorReading | undefined => {
    const reading = sensorHub.get(capId as any);
    if (!reading || !isFresh(reading.timestamp)) return undefined;
    return reading;
  };

  const hr = getLatest('heart_rate_camera');
  if (hr) {
    summary.heartRate = {
      value: Number(hr.value),
      unit: hr.unit,
      source: hr.source,
      quality: hr.quality,
      timestamp: hr.timestamp,
    };
  }

  const br = getLatest('breath_rate_mic');
  if (br) {
    summary.breathRate = {
      value: Number(br.value),
      unit: br.unit,
      source: br.source,
      quality: br.quality,
      timestamp: br.timestamp,
    };
  }

  // BP / Temp / Glucose — pushed via bpGlucose.ts (manual or BLE device).
  const bp = getLatest('ble_blood_pressure');
  if (bp) {
    let systolic = 0, diastolic = 0;
    try {
      const parsed = typeof bp.value === 'string' ? JSON.parse(bp.value) : bp.value;
      systolic = Number(parsed?.systolic ?? 0);
      diastolic = Number(parsed?.diastolic ?? 0);
    } catch { /* leave zeros */ }
    if (systolic > 0 && diastolic > 0) {
      summary.bloodPressure = {
        systolic, diastolic, unit: bp.unit,
        source: bp.source, quality: bp.quality, timestamp: bp.timestamp,
      };
    }
  }

  const bt = getLatest('ble_body_temperature');
  if (bt) {
    summary.bodyTemperature = {
      value: Number(bt.value), unit: bt.unit,
      source: bt.source, quality: bt.quality, timestamp: bt.timestamp,
    };
  }

  const bg = getLatest('ble_blood_glucose');
  if (bg) {
    summary.bloodGlucose = {
      value: Number(bg.value), unit: bg.unit,
      source: bg.source, quality: bg.quality, timestamp: bg.timestamp,
    };
  }

  const sc = getLatest('step_counter');
  if (sc) {
    summary.stepCount = {
      value: Number(sc.value),
      unit: sc.unit,
      source: sc.source,
      quality: sc.quality,
      timestamp: sc.timestamp,
    };
  }

  const ns = getLatest('network_status');
  if (ns) {
    summary.networkStatus = {
      online: String(ns.value) === 'online' || Boolean(ns.description?.includes('online')), // Simplified parse
      effectiveType: typeof ns.value === 'string' ? ns.value : null,
      source: ns.source,
      quality: ns.quality,
      timestamp: ns.timestamp,
    };
  }

  return summary;
}

/**
 * Formats sensor context into a concise natural-language block for LLM prompts.
 * Explicitly labels estimates vs. measured values to prevent hallucination of precision.
 */
export function formatSensorContextForPrompt(summary: SensorContextSummary): string {
  const parts: string[] = [];

  if (summary.heartRate) {
    const srcLabel = summary.heartRate.source === 'ESTIMATE' ? 'phone camera estimate' :
                     summary.heartRate.source === 'EXTERNAL_DEVICE' ? 'Bluetooth device' : 'manual entry';
    parts.push(`Heart rate: ${summary.heartRate.value} bpm (${srcLabel}, quality: ${summary.heartRate.quality})`);
  }

  if (summary.breathRate) {
    const srcLabel = summary.breathRate.source === 'ESTIMATE' ? 'microphone estimate' : 'other';
    parts.push(`Breath rate: ${summary.breathRate.value} breaths/min (${srcLabel})`);
  }

  if (summary.stepCount) {
    parts.push(`Steps today: ${summary.stepCount.value}`);
  }

  if (summary.networkStatus && !summary.networkStatus.online) {
    parts.push(`Device is offline.`);
  } else if (summary.networkStatus?.effectiveType) {
    parts.push(`Network: ${summary.networkStatus.effectiveType}`);
  }

  if (parts.length === 0) {
    return "No recent sensor data available.";
  }

  return `Recent Sensor Data:\n- ${parts.join('\n- ')}`;
}

/**
 * What the chat may do with an attached image, resolved against the model registry.
 *
 * This is the single honest answer to "can VEEDA see what is in this photo?".
 * It is NOT a result. The two paths are:
 *   - OCR: on-device Tesseract (medicineOcr.ts). Always available when the
 *     camera is present; produces TEXT the user can read and confirm. It never
 *     produces a clinical finding on its own.
 *   - Vision model: a registered, validated, approved model for the task. None
 *     ships today, so this always resolves to `not_validated`.
 *
 * The chat must never present an image as evidence of anything; this function
 * exists so the UI can say so explicitly rather than by omission.
 */
/**
 * Updated vision state machine using the vision provider allowlist.
 *
 * This is the single honest answer to "can VEEDA see what is in this photo?".
 * It is NOT a result. The two paths are:
 *   - OCR: on-device Tesseract (medicineOcr.ts). Always available when the
 *     camera is present; produces TEXT the user can read and confirm. It never
 *     produces a clinical finding on its own.
 *   - Vision model: a validated, vision-capable provider/model. None ships today,
 *     so this always resolves to NOT_CONFIGURED.
 *
 * The chat must never present an image as evidence of anything; this function
 * exists so the UI can say so explicitly rather than by omission.
 */
export function imageVisionState(_registry: ModelRegistry) {
  const allowlist = getVisionAllowlist();
  const hasVisionProvider = allowlist.length > 0;

  // No validated vision provider is configured, so no provider/model info.
  const state = resolveVisionState({
    hasVisionProvider,
    providerName: allowlist[0]?.providerName ?? null,
    model: allowlist[0]?.model ?? null,
    permissionDenied: false,
    processing: false,
    failed: false,
    providerDown: false,
  });

  const label = visionStateLabel(state);
  const note =
    state === 'AVAILABLE'
      ? `Vision model ${allowlist[0].model} is available for image analysis.`
      : state === 'NOT_CONFIGURED'
      ? 'No validated vision model is configured; only OCR is available.'
      : state === 'UNSUPPORTED_MODEL'
      ? 'Configured model does not support image input.'
      : state === 'PROVIDER_UNAVAILABLE'
      ? 'Vision provider is unavailable.'
      : state === 'PERMISSION_DENIED'
      ? 'Camera permission denied; cannot capture images.'
      : state === 'PROCESSING'
      ? 'Image is being processed by vision model.'
      : 'Vision processing failed.';

  return { state, label, note, available: state === 'AVAILABLE' };
}

/**
 * Runtime check: asks the backend whether a vision-capable provider with a
 * working key is actually configured. The local allowlist is necessary but
 * NOT sufficient — the backend must also have a usable API key.
 *
 * Returns the same shape as imageVisionState so callers can use either.
 * Never fabricates availability: if the request fails, falls back to the
 * local allowlist state (which is empty by default → NOT_CONFIGURED).
 */
export async function fetchVisionStatus(): Promise<{
  state: string;
  label: string;
  note: string;
  available: boolean;
  providers?: Array<{ name: string; model: string }>;
}> {
  const fallback = imageVisionState(buildRegistry([]));
  const unavailable = {
    state: 'PROVIDER_UNAVAILABLE',
    label: visionStateLabel('PROVIDER_UNAVAILABLE'),
    note: 'Vision capability status could not be confirmed by the server. OCR remains available.',
    available: false,
    providers: undefined,
  };
  try {
    const res = await apiFetchDetailed<{
      visionState?: string;
      visionLabel?: string;
      note?: string;
      available?: boolean;
      providers?: Array<{ name: string; model: string }>;
    }>('/vision/status', { method: 'GET' });
    if (res.ok && res.data) {
      return {
        state: res.data.visionState || fallback.state,
        label: res.data.visionLabel || fallback.label,
        note: res.data.note || fallback.note,
        available: res.data.available === true,
        providers: res.data.providers,
      };
    }
  } catch {
    // Network failure — fall back to local state.
  }
  return unavailable;
}

/**
 * Load patient health context and merge with sensor summary for a full chat context.
 * Returns an object containing both sensor data and patient health fields.
 */
export function getFullChatContext(userId: string): { sensor: SensorContextSummary; patient: import('./patientHealthContext').PatientHealthContext } {
  const sensor = getRecentSensorContext();
  const patient = loadPatientHealthContext(userId);
  return { sensor, patient };
}
